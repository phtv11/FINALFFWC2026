import axios from "axios";


// ============================
// Axios Instance
// ============================

const api = axios.create({

    baseURL:
        import.meta.env.VITE_BACKEND_URL
        ||
        "http://localhost:3000/api",

    headers: {

        "Content-Type":
        "application/json"

    }

});





// ============================
// RTB API
// ============================


// Backend mint RTB
// Backend ký transaction

export async function mintRTB(

    to:string,

    matchId:string,

    orderId?: string

){


    const body: any = { to, matchId };
    if (orderId) body.orderId = orderId;

    // Include API key header if provided via Vite env (VITE_API_KEY)
    const apiKey = import.meta.env.VITE_API_KEY;

    const response = await api.post(
        "/rtb/mint",
        body,
        apiKey ? { headers: { "x-api-key": apiKey } } : undefined
    );

    return response.data; // { txHash, tokenId }


}







// ============================
// PAYMENT API
// ============================


// Tạo order sau thanh toán
// Không gọi redeem

export async function createOrder(

    data:{

        userAddress:string;

        rtbTokenId:number;

        matchId:string;

        category:string;

        seat:string;

        price:number;

    }

){


    const response =
        await api.post(

            "/payment/pay",

            data

        );


    return response.data;


}








export async function submitRedeemTx(
    txHash: string,
    paymentTxHash?: string
) {
    const response = await api.post(
        "/payment/redeem",
        { txHash, paymentTxHash }
    );

    return response.data;
}

export async function verifyPayment(
    userAddress: string,
    matchId: string,
    paymentTxHash: string,
    amount: number
) {
    const response = await api.post(
        "/payment/verify-payment",
        {
            userAddress,
            matchId,
            paymentTxHash,
            amount
        }
    );

    return response.data;
}

// Lấy order

export async function getMatches() {
    const response = await api.get("/matches");
    return response.data;
}

export async function getOrder(

    orderId:string

){


    const response =
        await api.get(

            `/payment/order/${orderId}`

        );


    return response.data;


}







export async function getUserOrders(
    userAddress: string
) {
    const response = await api.get(`/payment/user/${encodeURIComponent(userAddress)}`);
    return response.data;
}

// ============================
// RTT API
// ============================


// Backend issue ticket
// Backend ký transaction

export async function issueTicket(

    tokenId:number,

    ticketRef:string

){


    const response =
        await api.post(

            "/rtt/issue",

            {

                tokenId,

                ticketRef

            }

        );


    return response.data;


}







export default api;