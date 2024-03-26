import { AppExecutionResult } from "@aztec/circuit-types";
import { SchnorrSignature } from "@aztec/circuits.js/barretenberg";
import { AztecAddress, Fr } from "@aztec/circuits.js";
import { pedersenHash } from "@aztec/foundation/crypto";
import { TicTacToeContract } from 'artifacts/TicTacToe.js';
import { Wallet } from "@aztec/aztec.js";
import { TIC_TAC_TOE_CONTRACT } from "./constants";

// TODO: Get rid of any
export const deserializeGame = (game: any) => {
    const challengerOpenSignature = game.challengerOpenSignature;
    const { open, orchestrator, turn } = game.executionResults;
    game.challengerOpenSignature = challengerOpenSignature ? {
        from: AztecAddress.fromString(challengerOpenSignature.from),
        sig: challengerOpenSignature.sig.map((val: string) => Fr.fromString(val))
    } : undefined;
    game.executionResults = {
        open: open ? AppExecutionResult.fromJSON(open) : open,
        orchestrator: orchestrator ? AppExecutionResult.fromJSON(orchestrator) : orchestrator,
        turn: turn.map((turn: any) => AppExecutionResult.fromJSON(turn))
    };
    game.turns = game.turns.map((turn: any) => turn.opponentSignature ? { ...turn, opponentSignature: SchnorrSignature.fromString(turn.opponentSignature) } : turn)
    return game;
}

export const genAztecId = (challenger: AztecAddress, host: AztecAddress) => {
    const randomSeed = Fr.random();
    const input = [challenger.toBuffer(), host.toBuffer(), randomSeed.toBuffer()];
    return `0x${pedersenHash(input).toString('hex')}`;
}

export const getTimeout = async (gameId: string, wallet: Wallet) => {
    if (!wallet) return;
    const contract = await TicTacToeContract.at(
        AztecAddress.fromString(TIC_TAC_TOE_CONTRACT),
        wallet
    );
    const noteHash = await contract.methods
        .get_game_note_hash(BigInt(gameId))
        .view();
    return await contract.methods.get_timeout(noteHash).view();
};