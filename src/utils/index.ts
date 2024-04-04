import { AppExecutionResult } from "@aztec/circuit-types";
import { AztecAddress, Fr } from "@aztec/circuits.js";
import { pedersenHash } from "@aztec/foundation/crypto";
import { BaseStateChannel, ContinuedStateChannel, TicTacToeContract } from '@mach-34/aztec-statechannel-tictactoe';
import { OpenChannelSignature } from '@mach-34/aztec-statechannel-tictactoe/dest/src/channel/base';
import { AccountWalletWithPrivateKey, Wallet } from "@aztec/aztec.js";
import { DoubleSpendFraudPayload, Game, SerializedGame, TimeoutFraudPayload } from "./types";
import { ADDRESS_ZERO } from "./constants";
import { StateChannel } from "contexts/UserContext";

export const answerTimeout = async (gameId: string, wallet: Wallet, address: AztecAddress, row: number, col: number) => {
    if (!wallet) return;
    const contract = await TicTacToeContract.at(
        address,
        wallet
    );
    await contract.methods
        .answer_timeout(BigInt(gameId), row, col)
        .send()
        .wait();
}

export const claimTimeoutWin = async (gameId: string, wallet: Wallet, address: AztecAddress) => {
    if (!wallet) return;
    const contract = await TicTacToeContract.at(
        address,
        wallet
    );
    await contract.methods
        .claim_timeout_win(BigInt(gameId))
        .send()
        .wait();
}

export const proveDoubleSpendFraud = async (wallet: Wallet, address: AztecAddress, payload: DoubleSpendFraudPayload) => {
    const contract = await TicTacToeContract.at(
        address,
        wallet
    );
    await contract.methods
        .claim_fraud_win(
            BigInt(payload.gameId),
            BigInt(payload.turnIndex),
            payload.firstMove,
            payload.secondMove,
            [...new Uint8Array(payload.firstSignature.toBuffer())],
            [...new Uint8Array(payload.secondSignature.toBuffer())]
        )
        .send()
        .wait();
}

export const proveTimeoutFraud = async (wallet: Wallet, address: AztecAddress, payload: TimeoutFraudPayload) => {
    const contract = await TicTacToeContract.at(
        address,
        wallet
    );

    await contract.methods
        .dispute_timeout(
            BigInt(payload.gameId),
            payload.turnIndex,
            payload.move,
            [...new Uint8Array(payload.signature.toBuffer())]
        )
        .send()
        .wait();
}

export const cloneGame = (game: Game) => {
    const clonedGame: Game = {
        challenger: AztecAddress.fromString(game.challenger.toString()),
        challengerOpenSignature: game.challengerOpenSignature,
        channel: game.channel ? cloneStateChannel(game.channel) : undefined,
        host: AztecAddress.fromString(game.host.toString()),
        id: game.id,
        lastPostedTurn: game.lastPostedTurn,
        over: game.over,
        timeout: game.timeout,
        turns: [...game.turns],
        turnIndex: game.turnIndex,
    };
    return clonedGame
}

export const cloneStateChannel = (channel: StateChannel): StateChannel => {
    if (channel instanceof BaseStateChannel) {
        const copy = new BaseStateChannel(channel.account, channel.contractAddress, channel.gameIndex);
        copy.openChannelResult = channel.openChannelResult;
        copy.turnResults = channel.turnResults;
        return copy;
    } else {
        const copy = new ContinuedStateChannel(channel.account, channel.contractAddress, channel.gameIndex, channel.startIndex);
        copy.turnResults = channel.turnResults;
        return copy;
    }
}

export const initNewGame = (): Game => {
    return {
        challenger: AztecAddress.fromString(ADDRESS_ZERO),
        challengerOpenSignature: undefined,
        channel: undefined,
        host: AztecAddress.fromString(ADDRESS_ZERO),
        id: '',
        lastPostedTurn: 0,
        over: false,
        timeout: 0,
        turns: [],
        turnIndex: 0
    }
}

export const formatAztecAddress = (address: string) => {
    return `${address.substring(0, 10)}...${address.substring(address.length - 8)}`
}

export const gameActive = (game: Game) => {
    return game.challenger.toString() !== ADDRESS_ZERO;
}

export const gameKey = (address: AztecAddress) => {
    return `activeGame_${address.toString()}`
}

export const genAztecId = (challenger: AztecAddress, host: AztecAddress) => {
    const randomSeed = Fr.random();
    const input = [challenger.toBuffer(), host.toBuffer(), randomSeed.toBuffer()];
    return `0x${pedersenHash(input).toString('hex')}`;
}

export const getAztecGameState = async (gameId: string, wallet: Wallet, address: AztecAddress) => {
    const contract = await TicTacToeContract.at(
        address,
        wallet
    );
    const board = await contract.methods.get_board(BigInt(gameId)).view();
    return board;
}

export const getTimeout = async (gameId: string, wallet: Wallet, address: AztecAddress) => {
    if (!wallet) return;
    const contract = await TicTacToeContract.at(
        address,
        wallet
    );
    const noteHash = await contract.methods
        .get_game_note_hash(BigInt(gameId))
        .view();
    const timeout = await contract.methods.get_timeout(noteHash).view();
    return timeout ? timeout + 600n : 0;
};

export const deserializeGame = (
    serialized: SerializedGame,
    wallet: AccountWalletWithPrivateKey,
    contractAddress: AztecAddress
): Game => {
    let challengerOpenSignature = undefined;
    if (serialized.challengerOpenSignature) {
        challengerOpenSignature = deserializeOpenChannel(serialized.challengerOpenSignature)
    }
    let channel = undefined;
    if (serialized.lastPostedTurn) {
        channel = new ContinuedStateChannel(wallet, contractAddress, BigInt(serialized.id), serialized.lastPostedTurn);
        const diff = serialized.turnIndex - serialized.lastPostedTurn;
        // Check if turn results have already been sliced
        if (diff === serialized.turnResults.length) {
            channel.turnResults = serialized.turnResults.map(res => AppExecutionResult.fromJSON(res));
        } else {
            channel.turnResults = serialized.turnResults.slice(diff).map(res => AppExecutionResult.fromJSON(res))
        }

    } else if (serialized.id) {
        channel = new BaseStateChannel(wallet, contractAddress, BigInt(serialized.id));
        channel.openChannelResult = serialized.openChannelResult ? AppExecutionResult.fromJSON(serialized.openChannelResult) : undefined;
        channel.turnResults = serialized.turnResults.map(res => AppExecutionResult.fromJSON(res));
    }
    return {
        challenger: AztecAddress.fromString(serialized.challenger),
        challengerOpenSignature,
        channel,
        host: AztecAddress.fromString(serialized.host),
        id: serialized.id,
        lastPostedTurn: serialized.lastPostedTurn,
        over: serialized.over,
        timeout: serialized.timeout,
        turnIndex: serialized.turnIndex,
        turns: serialized.turns
    }
}

export const serializeGame = (game: Game): SerializedGame => {

    const challengerOpenSignature = game.challengerOpenSignature ? serializeOpenChannel(game.challengerOpenSignature) : undefined;
    let openChannelResult = undefined;
    if (game.channel instanceof BaseStateChannel) {
        openChannelResult = game.channel.openChannelResult?.toJSON();
    }
    const turnResults = game.channel?.turnResults.map(res => res.toJSON()) ?? [];

    return {
        challenger: game.challenger.toString(),
        challengerOpenSignature,
        host: game.host.toString(),
        id: game.id,
        lastPostedTurn: game.lastPostedTurn,
        openChannelResult,
        over: game.over,
        timeout: game.timeout,
        turns: game.turns,
        turnIndex: game.turnIndex,
        turnResults,
    }
}

export const storeGame = (game: Game, address: AztecAddress) => {
    const serialized = serializeGame(game);
    localStorage.setItem(gameKey(address), JSON.stringify(serialized));
}

export const deserializeOpenChannel = (serialized: string[]): OpenChannelSignature => {
    return {
        from: AztecAddress.fromString(serialized[0]),
        //@ts-ignore
        sig: serialized.slice(1).map(s => Fr.fromString(s))
    }
}


export const serializeOpenChannel = (openChannel: OpenChannelSignature): string[] => {
    return [openChannel.from.toString(), ...openChannel.sig.map(s => s.toString())];
}

export const triggerManualTimeout = async (gameId: string, wallet: Wallet, address: AztecAddress) => {
    if (!wallet) return;
    const contract = await TicTacToeContract.at(
        address,
        wallet
    );
    await contract.methods.trigger_timeout(BigInt(gameId)).send().wait()
};