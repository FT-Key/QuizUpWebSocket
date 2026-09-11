import { Game as GameModel } from "../models/Game.js";
export function generateGameCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
export async function getUniqueGameCode() {
    for (let attempt = 0; attempt < 10; attempt++) {
        const code = generateGameCode();
        const exists = await GameModel.findOne({ gameCode: code }).lean();
        if (!exists)
            return code;
    }
    throw new Error("Failed to generate unique game code after 10 attempts");
}
//# sourceMappingURL=gameCode.js.map