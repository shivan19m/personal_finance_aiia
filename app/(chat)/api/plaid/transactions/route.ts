import { NextResponse } from "next/server";
import { Client } from "pg";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID!;
const PLAID_SECRET = process.env.PLAID_SECRET!;
const PLAID_ENV = process.env.PLAID_ENV || "sandbox";

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

const db = new Client({
    connectionString: process.env.POSTGRES_URL,
});
db.connect();

export async function POST(req: Request) {
    try {
        const { item_id } = await req.json();

        // Get access_token and user_id (email) for this item_id
        const result = await db.query(
            `SELECT access_token, user_id FROM plaid_accounts WHERE item_id = $1`,
            [item_id]
        );

        if (result.rowCount === 0) {
            return NextResponse.json({ error: "Item ID not found" }, { status: 404 });
        }

        const { access_token, user_id } = result.rows[0];

        // Fetch transactions
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        const endDate = new Date();

        const transactionsResponse = await plaidClient.transactionsGet({
            access_token,
            start_date: startDate.toISOString().split("T")[0],
            end_date: endDate.toISOString().split("T")[0],
            options: {
                count: 50,
                offset: 0,
            },
        });

        const transactions = transactionsResponse.data.transactions;

        // Log the transactions for debugging
        console.log(`🔹 Transactions for ${user_id}: ${transactions.length} transactions found.`);
        transactions.forEach((tx) => {
            console.log(`- ${tx.date} | ${tx.name} | $${tx.amount}`);
        });

        // Insert transactions into NeonDB
        const queryText = `
            INSERT INTO plaid_transactions (user_email, transaction_id, name, amount, date, category)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (transaction_id) DO NOTHING;
        `;

        for (const tx of transactions) {
            await db.query(queryText, [
                user_id, // Use user_id instead of user_email
                tx.transaction_id,
                tx.name,
                tx.amount,
                tx.date,
                tx.category ? tx.category.join(", ") : null, // Convert array to string if needed
            ]);
        }

        console.log("✅ Transactions stored successfully in NeonDB.");
        return NextResponse.json({ success: true, transactions });
    } catch (error) {
        console.error("❌ Error processing transactions:", error);
        return NextResponse.json({ error: "Failed to process transactions" }, { status: 500 });
    }
}
