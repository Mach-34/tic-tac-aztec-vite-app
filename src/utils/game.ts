import { AppExecutionResult } from "@aztec/circuit-types";
import { SchnorrSignature } from "@aztec/circuits.js/barretenberg";
import { AztecAddress, Fr } from "@aztec/circuits.js";

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