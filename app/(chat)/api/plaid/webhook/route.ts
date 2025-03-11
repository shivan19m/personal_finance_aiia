import { NextResponse } from "next/server";
import { Client } from "pg"; // NeonDB
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

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
        const { webhook_type, webhook_code, item_id } = await req.json();

        console.log(`🔔 Webhook Received: ${webhook_type} | ${webhook_code}`);

        if (webhook_type === "TRANSACTIONS") {
            if (webhook_code === "INITIAL_UPDATE" || webhook_code === "HISTORICAL_UPDATE") {
                console.log(`✅ Transactions are now ready for item_id: ${item_id}`);

                // Mark transactions as ready in NeonDB
                await db.query(
                    `UPDATE plaid_accounts SET transactions_ready = TRUE WHERE item_id = $1`,
                    [item_id]
                );

                // 🔹 Trigger transactions query
                await fetch(`http://localhost:3000/api/plaid/transactions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ item_id }),
                });
            }
        }

        return NextResponse.json({ success: true, message: "Webhook received and processed." });
    } catch (error) {
        console.error("❌ Webhook Processing Error:", error);
        return NextResponse.json({ error: "Failed to process webhook" }, { status: 500 });
    }
}
