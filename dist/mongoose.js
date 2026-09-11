import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import mongoose from "mongoose";
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    throw new Error("❌ MONGODB_URI no está definido en el .env");
}
let isConnected = false;
export default async function connectToDB() {
    if (isConnected)
        return;
    try {
        mongoose.set("strictQuery", false);
        await mongoose.connect(MONGODB_URI);
        isConnected = true;
    }
    catch (err) {
        console.error("❌ MongoDB connection error:", err);
        throw err;
    }
}
//# sourceMappingURL=mongoose.js.map