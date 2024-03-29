import { AztecAddress } from '@aztec/circuits.js';
import { StateChannel } from 'contexts/UserContext';
import { OpenChannelSignature } from '@mach-34/aztec-statechannel-tictactoe/dest/src/channel/base';
import { Move } from '@mach-34/aztec-statechannel-tictactoe';

export type Game = {
    challenger: AztecAddress;
    challengerOpenSignature: OpenChannelSignature | undefined;
    channel: StateChannel | undefined;
    host: AztecAddress;
    id: string;
    lastPostedTurn: number;
    over: boolean;
    timeout: number;
    turns: Turn[];
    turnIndex: number;
};

// Game in LocalStorage friendly format
export type SerializedGame = {
    challenger: string;
    challengerOpenSignature: string[] | undefined;
    host: string;
    id: string;
    lastPostedTurn: number;
    openChannelResult: object | undefined;
    over: boolean;
    timeout: number;
    turns: Turn[];
    turnResults: object[];
    turnIndex: number;
}

export type Turn = {
    col: number
    gameId: string
    opponentSignature?: string
    row: number
    sender: string
    senderSignature?: string
    turnIndex: number
}


// ##### Socket Event Responses #####

export type AnswerTimeoutResponse = {
    turn: Turn
}

export type FinalTurnResponse = {
    turnResult: object
}

export type JoinGameResponse = {
    address: string
    id: string
    signature: string[]
}

export type OpenChannelResponse = {
    openChannelResult: object;
}

export type SocketCallbackResponse = {
    status: string
}

export type SignTurnResponse = {
    signature: string
}


export type StartGameResponse = {
    address: string
}

export type TriggerTimeoutResponse = {
    turnResult?: object;
}

export type TurnResponse = {
    turn: Turn
}