import {
  type Message,
  createDataStreamResponse,
  smoothStream,
  streamText,
} from 'ai';
import { auth } from '@/app/(auth)/auth';
import { systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import {
  generateUUID,
  getMostRecentUserMessage,
  sanitizeResponseMessages,
} from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { isProductionEnvironment } from '@/lib/constants';
import { NextResponse } from 'next/server';
import { myProvider } from '@/lib/ai/providers';
import { Client } from "pg";
import { generateText} from 'ai';

export const maxDuration = 60;

const db = new Client({
  connectionString: process.env.POSTGRES_URL,
});
db.connect();

export async function POST(request: Request) {
  try {
    const {
      id,
      messages,
      selectedChatModel,
    }: {
      id: string;
      messages: Array<Message>;
      selectedChatModel: string;
    } = await request.json();

    const session = await auth();

    if (!session || !session.user || !session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    const userMessage = getMostRecentUserMessage(messages);

    if (!userMessage) {
      return new Response('No user message found', { status: 400 });
    }

    // Run quick LLM-based classification
    const requiresFinancialData = await shouldIncludeFinancialData(userMessage.content);

    if (requiresFinancialData) {
      const transactionsResult = await db.query(
          `SELECT transaction_id, name, amount, date, category FROM plaid_transactions WHERE user_email = $1 ORDER BY date DESC LIMIT 10`,
          [session.user.email]
      );

      const transactions = transactionsResult.rows.map((tx: { transaction_id: string, name: string, amount: number, date: string, category?: string }) =>
          `- ${tx.date}: $${tx.amount} at ${tx.name} (${tx.category || 'Uncategorized'})`
      ).join("\n");

      messages.push({
        id: generateUUID(),
        role: "system",
        content: `User's recent transactions:\n${transactions}`,
        createdAt: new Date(),
      } as Message);
    }

    const chat = await getChatById({ id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message: userMessage,
      });

      await saveChat({ id, userId: session.user.id, title });
    } else {
      if (chat.userId !== session.user.id) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    await saveMessages({
      messages: [{ ...userMessage, createdAt: new Date(), chatId: id }],
    });

    return createDataStreamResponse({
      execute: (dataStream) => {
        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: systemPrompt({ selectedChatModel }),
          messages,
          maxSteps: 5,
          experimental_activeTools:
              selectedChatModel === 'chat-model-reasoning'
                  ? []
                  : [
                    'getWeather',
                    'createDocument',
                    'updateDocument',
                    'requestSuggestions',
                  ],
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
          tools: {
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
            }),
          },
          onFinish: async ({ response, reasoning }) => {
            if (session.user?.id) {
              try {
                const sanitizedResponseMessages = sanitizeResponseMessages({
                  messages: response.messages,
                  reasoning,
                });

                await saveMessages({
                  messages: sanitizedResponseMessages.map((message) => {
                    return {
                      id: message.id,
                      chatId: id,
                      role: message.role,
                      content: message.content,
                      createdAt: new Date(),
                    };
                  }),
                });
              } catch (error) {
                console.error('Failed to save chat');
              }
            }
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text',
          },
        });

        result.consumeStream();

        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
      },
      onError: () => {
        return 'Oops, an error occured!';
      },
    });
  } catch (error) {
    return NextResponse.json({ error }, { status: 400 });
  }
}

async function shouldIncludeFinancialData(userMessage: string): Promise<boolean> {
  const classificationPrompt = {
    system: `You are a classifier that determines if a user query requires access to their financial transaction history. Answer in 1 word with only "TRUE" or "FALSE". `,
    prompt: JSON.stringify({
      role: "user",
      content: userMessage,
    }),
  };

  const { text } = await generateText({
    model: myProvider.languageModel("chat-model-small"),
    ...classificationPrompt, // ✅ Matches the format used elsewhere
  });

  const result = (text ?? "").trim().toUpperCase();
  console.log(result);
  return result === "TRUE";
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    if (chat.userId !== session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    await deleteChatById({ id });

    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    return new Response('An error occurred while processing your request', {
      status: 500,
    });
  }
}


// import {
//   type Message,
//   createDataStreamResponse,
//   smoothStream,
//   streamText,
// } from 'ai';
// import { auth } from '@/app/(auth)/auth';
// import { systemPrompt } from '@/lib/ai/prompts';
// import {
//   deleteChatById,
//   getChatById,
//   saveChat,
//   saveMessages,
// } from '@/lib/db/queries';
// import {
//   generateUUID,
//   getMostRecentUserMessage,
//   sanitizeResponseMessages,
// } from '@/lib/utils';
// import { generateTitleFromUserMessage } from '../../actions';
// import { createDocument } from '@/lib/ai/tools/create-document';
// import { updateDocument } from '@/lib/ai/tools/update-document';
// import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
// import { getWeather } from '@/lib/ai/tools/get-weather';
// import { isProductionEnvironment } from '@/lib/constants';
// import { NextResponse } from 'next/server';
// import { myProvider } from '@/lib/ai/providers';
//
// export const maxDuration = 60;
//
// export async function POST(request: Request) {
//   try {
//     const {
//       id,
//       messages,
//       selectedChatModel,
//     }: {
//       id: string;
//       messages: Array<Message>;
//       selectedChatModel: string;
//     } = await request.json();
//
//     const session = await auth();
//
//     if (!session || !session.user || !session.user.id) {
//       return new Response('Unauthorized', { status: 401 });
//     }
//
//     const userMessage = getMostRecentUserMessage(messages);
//
//     if (!userMessage) {
//       return new Response('No user message found', { status: 400 });
//     }
//
//     const chat = await getChatById({ id });
//
//     if (!chat) {
//       const title = await generateTitleFromUserMessage({
//         message: userMessage,
//       });
//
//       await saveChat({ id, userId: session.user.id, title });
//     } else {
//       if (chat.userId !== session.user.id) {
//         return new Response('Unauthorized', { status: 401 });
//       }
//     }
//
//     await saveMessages({
//       messages: [{ ...userMessage, createdAt: new Date(), chatId: id }],
//     });
//
//     return createDataStreamResponse({
//       execute: (dataStream) => {
//         const result = streamText({
//           model: myProvider.languageModel(selectedChatModel),
//           system: systemPrompt({ selectedChatModel }),
//           messages,
//           maxSteps: 5,
//           experimental_activeTools:
//             selectedChatModel === 'chat-model-reasoning'
//               ? []
//               : [
//                   'getWeather',
//                   'createDocument',
//                   'updateDocument',
//                   'requestSuggestions',
//                 ],
//           experimental_transform: smoothStream({ chunking: 'word' }),
//           experimental_generateMessageId: generateUUID,
//           tools: {
//             getWeather,
//             createDocument: createDocument({ session, dataStream }),
//             updateDocument: updateDocument({ session, dataStream }),
//             requestSuggestions: requestSuggestions({
//               session,
//               dataStream,
//             }),
//           },
//           onFinish: async ({ response, reasoning }) => {
//             if (session.user?.id) {
//               try {
//                 const sanitizedResponseMessages = sanitizeResponseMessages({
//                   messages: response.messages,
//                   reasoning,
//                 });
//
//                 await saveMessages({
//                   messages: sanitizedResponseMessages.map((message) => {
//                     return {
//                       id: message.id,
//                       chatId: id,
//                       role: message.role,
//                       content: message.content,
//                       createdAt: new Date(),
//                     };
//                   }),
//                 });
//               } catch (error) {
//                 console.error('Failed to save chat');
//               }
//             }
//           },
//           experimental_telemetry: {
//             isEnabled: isProductionEnvironment,
//             functionId: 'stream-text',
//           },
//         });
//
//         result.consumeStream();
//
//         result.mergeIntoDataStream(dataStream, {
//           sendReasoning: true,
//         });
//       },
//       onError: () => {
//         return 'Oops, an error occured!';
//       },
//     });
//   } catch (error) {
//     return NextResponse.json({ error }, { status: 400 });
//   }
// }
//
// export async function DELETE(request: Request) {
//   const { searchParams } = new URL(request.url);
//   const id = searchParams.get('id');
//
//   if (!id) {
//     return new Response('Not Found', { status: 404 });
//   }
//
//   const session = await auth();
//
//   if (!session || !session.user) {
//     return new Response('Unauthorized', { status: 401 });
//   }
//
//   try {
//     const chat = await getChatById({ id });
//
//     if (chat.userId !== session.user.id) {
//       return new Response('Unauthorized', { status: 401 });
//     }
//
//     await deleteChatById({ id });
//
//     return new Response('Chat deleted', { status: 200 });
//   } catch (error) {
//     return new Response('An error occurred while processing your request', {
//       status: 500,
//     });
//   }
// }
