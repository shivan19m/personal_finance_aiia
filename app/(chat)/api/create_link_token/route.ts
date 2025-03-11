import { NextResponse } from "next/server";
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID!;
const PLAID_SECRET = process.env.PLAID_SECRET!;
const PLAID_ENV = process.env.PLAID_ENV || "sandbox";
const PLAID_WEBHOOK_URL = process.env.PLAID_WEBHOOK_URL || undefined;

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

export async function POST() {
    try {
        const response = await plaidClient.linkTokenCreate({
            user: { client_user_id: "sandbox_user_123" },
            client_name: "Finance Chatbot",
            products: [Products.Transactions, Products.Identity],
            country_codes: [CountryCode.Us],
            language: "en",
            redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
            webhook: PLAID_WEBHOOK_URL,
        });

        return NextResponse.json({ link_token: response.data.link_token });
    } catch (error) {
        console.error("Error creating Plaid Link Token:", error);
        return NextResponse.json({ error: "Failed to create Plaid Link Token" }, { status: 500 });
    }
}
