import { ActionSchema, AllowedInputTypes } from "@stackr/sdk";
import dotenv from "dotenv";
import { Wallet } from "ethers";

dotenv.config();

const operator = new Wallet(process.env.PRIVATE_KEY as string);

const signMessage = async (
  wallet: Wallet,
  schema: ActionSchema,
  payload: AllowedInputTypes
) => {
  const signature = await wallet.signTypedData(
    schema.domain,
    schema.EIP712TypedData.types,
    payload
  );
  return signature;
};
