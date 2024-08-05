import { ActionSchema, SolidityType } from "@stackr/sdk";

export const MintTokenSchema = new ActionSchema("mintToken", {
  token: SolidityType.ADDRESS,
  address: SolidityType.ADDRESS,
  amount: SolidityType.STRING,
  timestamp: SolidityType.UINT,
});

export const UpdateOraclePriceSchema = new ActionSchema("updateOraclePrice", {
  price: SolidityType.STRING,
  timestamp: SolidityType.UINT,
});

export const SwapTokenSchema = new ActionSchema("swapToken", {
  tokenIn: SolidityType.ADDRESS,
  tokenOut: SolidityType.ADDRESS,
  amount: SolidityType.STRING,
  timestamp: SolidityType.UINT,
});

export const WithdrawTokenSchema = new ActionSchema("withdrawToken", {
  token: SolidityType.ADDRESS,
  amount: SolidityType.STRING,
  timestamp: SolidityType.UINT,
});
