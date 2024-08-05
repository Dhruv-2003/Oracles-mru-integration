import { STF, Transitions, REQUIRE } from "@stackr/sdk/machine";
import { BridgeState, BridgeStateType, BridgeTree } from "./machine";

type MintTokenInput = {
  token: string;
  address: string;
  amount: number;
  timestamp: number;
};

const mintToken: STF<BridgeState, MintTokenInput> = {
  handler: ({ state, inputs, msgSender }) => {
    const { token, address, amount, timestamp } = inputs;

    REQUIRE(
      msgSender == "0xBF17F859989A73C55c7BA5Fefb40e63715216B9b",
      "Only the operator can mint tokens"
    );

    REQUIRE(amount > 0, "Amount must be greater than 0");

    if (token === "0x0000000000000000000000000000000000000000") {
      state.bridgeState.token1Balance[address] += amount;
    } else {
      state.bridgeState.token2Balance[address] += amount;
    }

    return state;
  },
};

type UpdateOracelPriceInput = {
  price: number;
  timestamp: number;
};

const updateOraclePrice: STF<BridgeState, UpdateOracelPriceInput> = {
  handler: ({ state, inputs, msgSender }) => {
    const { price, timestamp } = inputs;

    REQUIRE(
      msgSender == "0xBF17F859989A73C55c7BA5Fefb40e63715216B9b",
      "Only the operator can mint tokens"
    );

    // price will not be in decimal 8 , will be converted and then stored , with Round off
    state.bridgeState.price = price;

    return state;
  },
};

type SwapTokenInput = {
  tokenIn: string; // tokenIn
  tokenOut: string; // tokenOut
  amount: number;
  timestamp: number;
};

const swapTokens: STF<BridgeState, SwapTokenInput> = {
  handler: ({ state, inputs, msgSender }) => {
    const { tokenIn, tokenOut, amount, timestamp } = inputs;

    REQUIRE(amount > 0, "Amount must be greater than 0");
    REQUIRE(
      tokenIn !== tokenOut &&
        (tokenIn == "0x0000000000000000000000000000000000000000" ||
          tokenOut == "0x0000000000000000000000000000000000000000"),
      "Tokens must be different & one of them must be ETH"
    );

    // take in the current price
    const price = state.bridgeState.price; // price for ETH / USD pair always

    // check user Balance for the token1
    const user = msgSender as string;
    if (tokenIn === "0x0000000000000000000000000000000000000000") {
      REQUIRE(
        state.bridgeState.token1Balance[user] >= amount,
        "Insufficient balance"
      );

      // calculate the amount of token2 to send to the user
      const amountIn = amount;
      const amountOut = amountIn * price;

      // check pool Balance for the token2
      REQUIRE(
        state.bridgeState.token2Balance[
          "0x0000000000000000000000000000000000000000"
        ] >= amountOut,
        "Insufficient liquidity"
      );

      // update the balances
      state.bridgeState.token1Balance[user] -= amountIn;
      state.bridgeState.token2Balance[
        "0x0000000000000000000000000000000000000000"
      ] -= amountOut;
      state.bridgeState.token2Balance[user] += amountOut;
      state.bridgeState.token1Balance[
        "0x0000000000000000000000000000000000000000"
      ] += amountIn;
    } else {
      REQUIRE(
        state.bridgeState.token2Balance[user] >= amount,
        "Insufficient balance"
      );

      // calculate the amount of token1 to send to the user
      const amountIn = amount;
      const amountOut = amountIn / price;

      // check pool Balance for the token1
      REQUIRE(
        state.bridgeState.token1Balance[
          "0x0000000000000000000000000000000000000000"
        ] >= amountOut,
        "Insufficient liquidity"
      );

      // update the balances
      state.bridgeState.token2Balance[user] -= amountIn;
      state.bridgeState.token1Balance[
        "0x0000000000000000000000000000000000000000"
      ] -= amountOut;
      state.bridgeState.token1Balance[user] += amountOut;
      state.bridgeState.token2Balance[
        "0x0000000000000000000000000000000000000000"
      ] += amountIn;
    }

    return state;
  },
};

type WithdrawTokenInput = {
  token: string;
  amount: number;
  timestamp: number;
};

// track the events and logs of this withdrawToken Action to perform the actual withdraw by releasing the funds on chain
// performed by the syncer / manager
const withdrawToken: STF<BridgeState, WithdrawTokenInput> = {
  handler: ({ state, inputs, msgSender }) => {
    const { token, amount, timestamp } = inputs;

    REQUIRE(amount > 0, "Amount must be greater than 0");

    if (token === "0x0000000000000000000000000000000000000000") {
      REQUIRE(
        state.bridgeState.token1Balance[msgSender as string] >= amount,
        "Insufficient balance"
      );

      state.bridgeState.token1Balance[msgSender as string] -= amount;
    } else {
      REQUIRE(
        state.bridgeState.token2Balance[msgSender as string] >= amount,
        "Insufficient balance"
      );
      state.bridgeState.token2Balance[msgSender as string] -= amount;
    }

    return state;
  },
};

export const transitions: Transitions<BridgeState> = {
  mintToken,
  updateOraclePrice,
  swapTokens,
  withdrawToken,
};
