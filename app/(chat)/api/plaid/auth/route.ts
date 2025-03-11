import { NextResponse } from "next/server";
import { Client } from "pg"; // NeonDB
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

// 🔹 Load Plaid credentials
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID!;
const PLAID_SECRET = process.env.PLAID_SECRET!;
const PLAID_ENV = process.env.PLAID_ENV || "sandbox";

// 🔹 Initialize Plaid client
const plaidClient = new PlaidApi(
    new Configuration({
        basePath: PlaidEnvironments[PLAID_ENV],
        baseOptions: {
            headers: {
                "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
                "PLAID-SECRET": PLAID_SECRET,
                "Content-Type": "application/json",
            },
        },
    })
);

// 🔹 Database connection (NeonDB)
const db = new Client({
    connectionString: process.env.POSTGRES_URL,
});
db.connect();

export async function POST(req: Request) {
    try {
        const { public_token, user_id } = await req.json(); // Get token and user ID

        if (!public_token || !user_id) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // 🔹 Exchange public_token for access_token
        const tokenResponse = await plaidClient.itemPublicTokenExchange({ public_token });

        const access_token = tokenResponse.data.access_token;
        const item_id = tokenResponse.data.item_id;

        // 🔹 Store access token in Neon DB, linked to user
        await db.query(
            `INSERT INTO plaid_accounts (user_id, access_token, item_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
       SET access_token = $2, item_id = $3`,
            [user_id, access_token, item_id]
        );

        console.log(`✅ Stored Plaid token for user: ${user_id}`);

        return NextResponse.json({ success: true, item_id });
    } catch (error) {
        console.error("❌ Plaid Auth Error:", error);
        return NextResponse.json({ error: "Failed to authenticate with Plaid" }, { status: 500 });
    }
 }
// import { NextResponse } from "next/server";
// import { Client } from "pg"; // NeonDB
// import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
//
// // 🔹 Load Plaid credentials
// const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID!;
// const PLAID_SECRET = process.env.PLAID_SECRET!;
// const PLAID_ENV = process.env.PLAID_ENV || "sandbox";
//
// // 🔹 Initialize Plaid client
// const plaidClient = new PlaidApi(
//     new Configuration({
//         basePath: PlaidEnvironments[PLAID_ENV],
//         baseOptions: {
//             headers: {
//                 "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
//                 "PLAID-SECRET": PLAID_SECRET,
//                 "Content-Type": "application/json",
//             },
//         },
//     })
// );
//
// // 🔹 Database connection (NeonDB)
// const db = new Client({
//     connectionString: process.env.POSTGRES_URL,
// });
// db.connect();
//
// export async function POST(req: Request) {
//     try {
//         const { public_token, user_id } = await req.json(); // Get token and user ID
//
//         if (!public_token || !user_id) {
//             return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
//         }
//
//         // 🔹 Exchange public_token for access_token
//         const tokenResponse = await plaidClient.itemPublicTokenExchange({ public_token });
//
//         const access_token = tokenResponse.data.access_token;
//         const item_id = tokenResponse.data.item_id;
//
//         // 🔹 Store access token in Neon DB, linked to user
//         await db.query(
//             `INSERT INTO plaid_accounts (user_id, access_token, item_id)
//        VALUES ($1, $2, $3)
//        ON CONFLICT (user_id) DO UPDATE
//        SET access_token = $2, item_id = $3`,
//             [user_id, access_token, item_id]
//         );
//
//         console.log(`✅ Stored Plaid token for user: ${user_id}`);
//
//         // 🔹 Fetch transactions immediately after storing access_token
//         const startDate = new Date();
//         startDate.setDate(startDate.getDate() - 30);
//         const endDate = new Date();
//
//         const transactionsResponse = await plaidClient.transactionsGet({
//             access_token,
//             start_date: startDate.toISOString().split("T")[0],
//             end_date: endDate.toISOString().split("T")[0],
//             options: {
//                 count: 50,
//                 offset: 0,
//             },
//         });
//
//         const transactions = transactionsResponse.data.transactions;
//
//         // 🔹 Log transactions to server for debugging
//         console.log(`🔹 Transactions for ${user_id}:`, transactions.length);
//         transactions.forEach((tx) => {
//             console.log(`- ${tx.date} | ${tx.name} | $${tx.amount}`);
//         });
//
//         return NextResponse.json({ success: true, item_id, transactions });
//     } catch (error) {
//         console.error("❌ Plaid Auth & Transactions Error:", error);
//         return NextResponse.json({ error: "Failed to authenticate with Plaid and fetch transactions" }, { status: 500 });
//     }
// }
