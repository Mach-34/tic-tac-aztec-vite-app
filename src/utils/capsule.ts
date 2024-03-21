import { Contract, Fr } from "@aztec/aztec.js";
import { SchnorrSignature } from "@aztec/circuits.js/barretenberg";
import { Turn } from "./move";
import { serializeSignature, numToHex } from "utils";

export const emptyCapsuleStack = async (contract: Contract) => {
    try {
        await contract.methods.clear_capsule_stack().send().wait();
    } catch (err) { }
};

/**
 * Serializes a turn into a list of field elements ordered for capsule popping inside of witcalc
 *
 * @param turn - the turn to serialize into a list of Fr elements
 * @returns - a formatted capsule to push to stack
 */
export const encapsulateTurn = (turn: Turn) => {
    // todo: fix to be .toFields() with correct standard serialization
    const senderSignature = serializeSignature(
        new Uint8Array(turn.signatures.sender.toBuffer())
    );
    const opponentSignature = serializeSignature(
        new Uint8Array(
            (turn.signatures.opponent ?? SchnorrSignature.EMPTY).toBuffer()
        )
    );

    return [
        Fr.fromString(numToHex(turn.move.row)),
        Fr.fromString(numToHex(turn.move.col)),
        turn.move.sender,
        ...[senderSignature.s1, senderSignature.s2, senderSignature.s3],
        ...[opponentSignature.s1, opponentSignature.s2, opponentSignature.s3],
        Fr.fromString(numToHex(turn.timeout ? 1 : 0)),
    ];
};