import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import type {
  AssistantApiRequest,
  AssistantApiResponse,
  AssistantConversationContent,
  AssistantConversationPart,
  AssistantFunctionCall,
  AssistantToolCallsResponse,
  RoverCommandResult,
} from "@/lib/types";

export const runtime = "nodejs";

const MODEL = "gemini-2.5-flash";

const SYSTEM_INSTRUCTION = [
  "You are a mission assistant for a building inspection rover.",
  "Answer questions about the environment using the provided graph context.",
  "When the user asks to physically command the rover or read rover sensors, call the `rover_command` tool instead of describing what you would do.",
  "Normalize distances into centimeters before tool calls. Positive centimeters move forward and negative centimeters move backward.",
  "Normalize turns into degrees before tool calls. Positive degrees rotate clockwise and negative degrees rotate counterclockwise or left.",
  "If the user requests multiple rover actions, emit multiple `rover_command` calls in order.",
  "If a rover action is missing a required quantity or direction is ambiguous, ask a clarifying question instead of guessing.",
  "After tool results are available, summarize what actually happened and mention failures clearly.",
].join(" ");

function buildInitialConversation(
  userText: string,
  graphContext: string
): AssistantConversationContent[] {
  return [
    {
      role: "user",
      parts: [
        {
          text: `Knowledge graph:\n${graphContext}\n\nUser request: ${userText}`,
        },
      ],
    },
  ];
}

function normalizeToolArgs(
  args: unknown
): AssistantFunctionCall["args"] {
  const record =
    typeof args === "object" && args !== null
      ? (args as Record<string, unknown>)
      : {};

  return {
    action:
      typeof record.action === "string"
        ? (record.action as AssistantFunctionCall["args"]["action"])
        : "ping",
    degrees:
      typeof record.degrees === "number" ? record.degrees : undefined,
    centimeters:
      typeof record.centimeters === "number" ? record.centimeters : undefined,
  };
}

function normalizeParts(parts: unknown[]): AssistantConversationPart[] {
  const normalized: AssistantConversationPart[] = [];

  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const candidate = part as {
      text?: unknown;
      functionCall?: { name?: unknown; args?: unknown };
      functionResponse?: {
        name?: unknown;
        response?: { result?: unknown };
      };
    };

    if (typeof candidate.text === "string" && candidate.text.length > 0) {
      normalized.push({ text: candidate.text });
      continue;
    }

    if (candidate.functionCall?.name === "rover_command") {
      normalized.push({
        functionCall: {
          name: "rover_command",
          args: normalizeToolArgs(candidate.functionCall.args),
        },
      });
      continue;
    }

    if (candidate.functionResponse?.name === "rover_command") {
      const fallbackResult: RoverCommandResult = {
        ok: false,
        request: { type: "rover_ping" },
        message: "Missing rover tool result.",
      };
      const result =
        candidate.functionResponse.response?.result &&
        typeof candidate.functionResponse.response.result === "object"
          ? (candidate.functionResponse.response.result as RoverCommandResult)
          : fallbackResult;

      normalized.push({
        functionResponse: {
          name: "rover_command",
          response: {
            result,
          },
        },
      });
    }
  }

  return normalized;
}

function normalizeConversation(
  conversation: AssistantConversationContent[]
): AssistantConversationContent[] {
  return conversation.map((content) => ({
    role: content.role === "model" ? "model" : "user",
    parts: normalizeParts(content.parts),
  }));
}

function toGeminiContents(conversation: AssistantConversationContent[]) {
  return conversation.map((content) => ({
    role: content.role,
    parts: content.parts.reduce<
      Array<
        | { text: string }
        | {
            functionCall: {
              name: "rover_command";
              args: Record<string, unknown>;
            };
          }
        | {
            functionResponse: {
              name: "rover_command";
              response: { result: RoverCommandResult };
            };
          }
      >
    >((parts, part) => {
      if (part.text) {
        parts.push({ text: part.text });
      } else if (part.functionCall) {
        parts.push({
          functionCall: {
            name: part.functionCall.name,
            args: { ...part.functionCall.args } as Record<string, unknown>,
          },
        });
      } else if (part.functionResponse) {
        parts.push({
          functionResponse: {
            name: part.functionResponse.name,
            response: { ...part.functionResponse.response },
          },
        });
      }

      return parts;
    }, []),
  }));
}

function asToolCallsResponse(
  conversation: AssistantConversationContent[],
  toolCalls: AssistantFunctionCall[]
): AssistantToolCallsResponse {
  return {
    kind: "tool_calls",
    toolCalls,
    conversation,
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json<AssistantApiResponse>(
      {
        kind: "error",
        message: "GEMINI_API_KEY is not set. Add it to frontend/.env.local.",
      },
      { status: 500 }
    );
  }

  let body: AssistantApiRequest;
  try {
    body = (await request.json()) as AssistantApiRequest;
  } catch {
    return NextResponse.json<AssistantApiResponse>(
      {
        kind: "error",
        message: "Invalid JSON request body.",
      },
      { status: 400 }
    );
  }

  const contents =
    "conversation" in body
      ? normalizeConversation(body.conversation)
      : buildInitialConversation(body.userText, body.graphContext);

  try {
    const ai = new GoogleGenAI({ apiKey });
    const geminiContents = toGeminiContents(contents);
    const result = await ai.models.generateContent({
      model: MODEL,
      contents: geminiContents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        maxOutputTokens: 1024,
        tools: [
          {
            functionDeclarations: [
              {
                name: "rover_command",
                description:
                  "Send a rover movement or sensor command through the shared websocket connection.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    action: {
                      type: Type.STRING,
                      description:
                        "The rover action to run.",
                      enum: [
                        "ping",
                        "zero",
                        "stop",
                        "rotate",
                        "distance",
                        "read_air",
                        "read_motion",
                      ],
                    },
                    degrees: {
                      type: Type.NUMBER,
                      description:
                        "Required for rotate. Positive is clockwise, negative is counterclockwise.",
                    },
                    centimeters: {
                      type: Type.NUMBER,
                      description:
                        "Required for distance. Positive is forward, negative is backward.",
                    },
                  },
                  required: ["action"],
                },
              },
            ],
          },
        ],
      },
    });

    const toolCalls: AssistantFunctionCall[] =
      (result.functionCalls ?? [])
        .filter((call) => call.name === "rover_command")
        .map((call) => ({
          name: "rover_command",
          args: normalizeToolArgs(call.args),
        }));

    if (toolCalls.length > 0) {
      const modelContent =
        result.candidates?.[0]?.content && result.candidates[0].content.parts
          ? {
              role: "model" as const,
              parts: normalizeParts(result.candidates[0].content.parts),
            }
          : {
              role: "model" as const,
              parts: toolCalls.map((toolCall) => ({
                functionCall: toolCall,
              })),
            };

      return NextResponse.json<AssistantApiResponse>(
        asToolCallsResponse([...contents, modelContent], toolCalls)
      );
    }

    return NextResponse.json<AssistantApiResponse>({
      kind: "final",
      text: result.text || "Sorry, I could not generate a response.",
    });
  } catch (error) {
    return NextResponse.json<AssistantApiResponse>(
      {
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Assistant request failed.",
      },
      { status: 500 }
    );
  }
}
