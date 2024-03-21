import { Schnorr } from "@aztec/aztec.js";
import { AztecAddress, Fr, GrumpkinScalar } from "@aztec/circuits.js";


/**
 * Converts a number to a 32 byte hex string so structure mirrors Noir's for accurate hashing
 *
 * @param {BigInt | number} num - number to be hexlified
 * @returns 32 bytes hex string
 */
export const numToHex = (num: BigInt | number) => {
    // Add missing padding based of hex number length
    return num.toString(16).padStart(64, "0");
};

/**
 * Serializes a signature from a signature buffer to 3 Fr elements
 * @param signature
 * @returns - the serialized signature as 3 Fr elements
 */
export const serializeSignature = (signature: Uint8Array) => {
    // Serialized signature to pass into the capsule. Signature is a Uint8Array of length 64
    // and must be split into chunks less than 32 bytes in size to no exceed Field size
    const s1 = Fr.fromBuffer(Buffer.from(signature.slice(0, 20)));
    const s2 = Fr.fromBuffer(Buffer.from(signature.slice(20, 40)));
    // 64 is not divisible by 3 so last slice will be be slightly larger
    const s3 = Fr.fromBuffer(Buffer.from(signature.slice(40)));
    return { s1, s2, s3 };
};


export const signOpenChannel = (privkey: GrumpkinScalar, host: string, challenger: string) => {
    let hostAddress = AztecAddress.fromString(host).toBuffer();
    let challengerAddress = AztecAddress.fromString(challenger).toBuffer();

    const channelMsg = new Uint8Array(64);
    channelMsg.set(Uint8Array.from(hostAddress), 0);
    channelMsg.set(Uint8Array.from(challengerAddress), 32);

    return signSchnorr(channelMsg, privkey);
}

/**
 * Produces a schnorr signature over a given message with a given private key
 * @param msg - the message to sign
 * @param privkey - the key to sign the message with
 * @returns the signature over the message by privkey
 */
export const signSchnorr = (
    msg: Uint8Array,
    privkey: GrumpkinScalar
): Uint8Array => {
    const schnorr = new Schnorr();
    const signature = schnorr.constructSignature(msg, privkey);
    return new Uint8Array(signature.toBuffer());
};

export const signTurn = (privkey: GrumpkinScalar, sender: string, gameId: Fr, turnIndex: number, row: number, col: number) => {
    const address = AztecAddress.fromString(sender).toBuffer();
    const moveMsg = new Uint8Array(67);
    const addressBytes = Uint8Array.from(address);
    const gameIndexBytes = Uint8Array.from(gameId.toBuffer());
    moveMsg.set(addressBytes, 0);
    moveMsg.set(gameIndexBytes, 32);
    moveMsg.set([turnIndex, row, col], 64);

    return signSchnorr(moveMsg, privkey);
};

export * from "./capsule.ts";
export * from "./move.ts";