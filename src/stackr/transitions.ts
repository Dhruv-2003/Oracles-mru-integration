import { STF, Transitions, REQUIRE } from "@stackr/sdk/machine";
import { BridgeState, BridgeStateType, BridgeTree } from "./machine";
import { formatEther, formatUnits, parseEther, parseUnits } from "ethers";

type MintTokenInput = {
  token: string;
  address: string;
  amount: string;
  timestamp: number;
};

const mintToken: STF<BridgeState, MintTokenInput> = {
  handler: ({ state, inputs, msgSender }) => {
    const { token, address, amount, timestamp } = inputs;

    REQUIRE(
      msgSender == "0xBF17F859989A73C55c7BA5Fefb40e63715216B9b",
      "Only the operator can mint tokens"
    );

    const _amount = BigInt(amount);
    REQUIRE(_amount > 0, "Amount must be greater than 0");

    if (token === "0x0000000000000000000000000000000000000000") {
      const balance = BigInt(state.bridgeState.token1Balance[address] || 0);
      state.bridgeState.token1Balance[address] = (balance + _amount).toString();
    } else {
      const balance = BigInt(state.bridgeState.token2Balance[address] || 0);
      state.bridgeState.token2Balance[address] = (balance + _amount).toString();
    }

    return state;
  },
};

type UpdateOracelPriceInput = {
  price: string;
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
  amount: string;
  timestamp: number;
};

const swapToken: STF<BridgeState, SwapTokenInput> = {
  handler: ({ state, inputs, msgSender }) => {
    const { tokenIn, tokenOut, amount, timestamp } = inputs;
    const _amount = BigInt(amount);
    REQUIRE(_amount > 0, "Amount must be greater than 0");

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
        BigInt(state.bridgeState.token1Balance[user] || 0) >= _amount,
        "Insufficient balance"
      );

      // calculate the amount of token2 to send to the user
      const amountIn = Number(formatEther(_amount));
      const amountOut = amountIn * Number(formatUnits(price, 8));

      const _amountOut = parseUnits(amountOut.toString(), 6);

      // check pool Balance for the token2
      REQUIRE(
        BigInt(
          state.bridgeState.token2Balance[
            "0x0000000000000000000000000000000000000000"
          ] || 0
        ) >= _amountOut,
        "Insufficient liquidity"
      );

      // update the balances
      const userToken1Balance = BigInt(
        state.bridgeState.token1Balance[user] || 0
      );
      state.bridgeState.token1Balance[user] = (
        userToken1Balance - _amount
      ).toString();

      const poolToken2Balance = BigInt(
        state.bridgeState.token2Balance[
          "0x0000000000000000000000000000000000000000"
        ] || 0
      );
      state.bridgeState.token2Balance[
        "0x0000000000000000000000000000000000000000"
      ] = (poolToken2Balance - _amountOut).toString();

      const userToken2Balance = BigInt(
        state.bridgeState.token2Balance[user] || 0
      );
      state.bridgeState.token2Balance[user] = (
        userToken2Balance + _amountOut
      ).toString();

      const poolToken1Balance = BigInt(
        state.bridgeState.token1Balance[
          "0x0000000000000000000000000000000000000000"
        ] || 0
      );
      state.bridgeState.token1Balance[
        "0x0000000000000000000000000000000000000000"
      ] = (poolToken1Balance + _amount).toString();
    } else {
      REQUIRE(
        BigInt(state.bridgeState.token2Balance[user] || 0) >= _amount,
        "Insufficient balance"
      );

      // calculate the amount of token1 to send to the user
      const amountIn = Number(formatUnits(amount, 6));
      const amountOut = amountIn / Number(formatUnits(price, 8));
      const _amountOut = parseEther(amountOut.toString());

      // check pool Balance for the token1
      REQUIRE(
        BigInt(
          state.bridgeState.token1Balance[
            "0x0000000000000000000000000000000000000000"
          ] || 0
        ) >= _amountOut,
        "Insufficient liquidity"
      );

      // update the balances
      const userToken2Balance = BigInt(
        state.bridgeState.token2Balance[user] || 0
      );
      state.bridgeState.token2Balance[user] = (
        userToken2Balance - _amount
      ).toString();

      const poolToken1Balance = BigInt(
        state.bridgeState.token1Balance[
          "0x0000000000000000000000000000000000000000"
        ] || 0
      );
      state.bridgeState.token1Balance[
        "0x0000000000000000000000000000000000000000"
      ] = (poolToken1Balance - _amountOut).toString();

      const userToken1Balance = BigInt(
        state.bridgeState.token1Balance[user] || 0
      );
      state.bridgeState.token1Balance[user] = (
        userToken1Balance + _amountOut
      ).toString();

      const poolToken2Balance = BigInt(
        state.bridgeState.token2Balance[
          "0x0000000000000000000000000000000000000000"
        ] || 0
      );
      state.bridgeState.token2Balance[
        "0x0000000000000000000000000000000000000000"
      ] = (poolToken2Balance + _amount).toString();
    }

    return state;
  },
};

type WithdrawTokenInput = {
  token: string;
  amount: string;
  timestamp: number;
};

// track the events and logs of this withdrawToken Action to perform the actual withdraw by releasing the funds on chain
// performed by the syncer / manager
const withdrawToken: STF<BridgeState, WithdrawTokenInput> = {
  handler: ({ state, inputs, msgSender }) => {
    const { token, amount, timestamp } = inputs;
    const _amount = BigInt(amount);
    REQUIRE(_amount > 0, "Amount must be greater than 0");

    if (token === "0x0000000000000000000000000000000000000000") {
      REQUIRE(
        BigInt(state.bridgeState.token1Balance[msgSender as string] || 0) >=
          _amount,
        "Insufficient balance"
      );
      const balance = BigInt(
        state.bridgeState.token1Balance[msgSender as string] || 0
      );
      state.bridgeState.token1Balance[msgSender as string] = (
        balance - _amount
      ).toString();
    } else {
      REQUIRE(
        BigInt(state.bridgeState.token2Balance[msgSender as string] || 0) >=
          _amount,
        "Insufficient balance"
      );

      const balance = BigInt(
        state.bridgeState.token2Balance[msgSender as string] || 0
      );
      state.bridgeState.token2Balance[msgSender as string] = (
        balance - _amount
      ).toString();
    }

    return state;
  },
};

export const transitions: Transitions<BridgeState> = {
  mintToken,
  updateOraclePrice,
  swapToken,
  withdrawToken,
};
