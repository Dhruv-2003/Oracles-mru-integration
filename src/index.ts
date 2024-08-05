import {
  ActionConfirmationStatus,
  ActionEvents,
  ActionSchema,
  AllowedInputTypes,
  MicroRollup,
} from "@stackr/sdk";
import { Bridge } from "@stackr/sdk/plugins";
import { Wallet, AbiCoder, formatEther } from "ethers";
import dotenv from "dotenv";

import { stackrConfig } from "../stackr.config.ts";
import { machine } from "./stackr/machine.ts";
import {
  MintTokenSchema,
  SwapTokenSchema,
  UpdateOracelPriceSchema,
  WithdrawTokenSchema,
} from "./stackr/action.ts";
import { JsonRpcProvider } from "ethers";
import { Contract } from "ethers";
import { ABI, ADDRESS } from "./contract/constants.ts";

dotenv.config();

const abiCoder = AbiCoder.defaultAbiCoder();
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

async function main() {
  const rollup = await MicroRollup({
    config: stackrConfig,
    actionSchemas: [
      MintTokenSchema,
      UpdateOracelPriceSchema,
      SwapTokenSchema,
      WithdrawTokenSchema,
    ],
    stateMachines: [machine],
    stfSchemaMap: {
      mintToken: MintTokenSchema.identifier,
      updateOraclePrice: UpdateOracelPriceSchema.identifier,
      swapToken: SwapTokenSchema.identifier,
      withdrawToken: WithdrawTokenSchema.identifier,
    },
  });
  await rollup.init();

  Bridge.init(rollup, {
    handlers: {
      BRIDGE_ETH: async (args) => {
        const [_to, _amount] = abiCoder.decode(["address", "uint"], args.data);
        console.log("Minting token to", _to, "with amount", _amount);

        const inputs = {
          token: "0x0000000000000000000000000000000000000000",
          address: _to,
          amount: Number(formatEther(_amount)),
          timestamp: Date.now(),
        };

        const signature = await signMessage(operator, MintTokenSchema, inputs);
        const action = MintTokenSchema.actionFrom({
          inputs,
          signature,
          msgSender: operator.address,
        });

        return {
          transitionName: "mintToken",
          action: action,
        };
      },
      BRIDGE_ERC20: async (args) => {
        const [_token, _to, _amount] = abiCoder.decode(
          ["address", "address", "uint"],
          args.data
        );
        console.log("Minting token", _token, "to", _to, "with amount", _amount);

        const inputs = {
          token: _token,
          address: _to,
          amount: Number(formatEther(_amount)),
          timestamp: Date.now(),
        };

        const signature = await signMessage(operator, MintTokenSchema, inputs);
        const action = MintTokenSchema.actionFrom({
          inputs,
          signature,
          msgSender: operator.address,
        });

        return {
          transitionName: "mintToken",
          action: action,
        };
      },
      ORACLE_ETH_USDC: async (args) => {
        const [_price] = abiCoder.decode(["int"], args.data);
        console.log("Updating oracle price to", _price);

        const inputs = {
          price: _price,
          timestamp: Date.now(),
        };

        const signature = await signMessage(
          operator,
          UpdateOracelPriceSchema,
          inputs
        );
        const action = UpdateOracelPriceSchema.actionFrom({
          inputs,
          signature,
          msgSender: operator.address,
        });

        return {
          transitionName: "updateOraclePrice",
          action: action,
        };
      },
    },
  });

  rollup.events.subscribe(ActionEvents.CONFIRMATION_STATUS, async (event) => {
    if (
      event.actionName == "withdrawToken" &&
      event.status === ActionConfirmationStatus.C1
    ) {
      // process the token release on chain in the contract for withdrawToken
      // 1. find the action data for the action hash in the storage
      const action = await rollup.actions.getByHash(event.actionHash);
      if (!action) {
        return;
      }

      // 2. get the action payload for token , amount & user
      const { token: _token, amount: _amount } = action.payload;
      const _to = action.msgSender;

      // 3. call the contract method to release the token
      console.log("Releasing token", _token, "to", _to, "with amount", _amount);

      const provider = new JsonRpcProvider("=https://rpc2.sepolia.org");
      operator.connect(provider);

      const contract = new Contract(ADDRESS, ABI, operator);

      const tx = await contract.releaseTokens(_token, _to, _amount);
      console.log("Transaction hash", tx.hash);
      await tx.wait();

      console.log("Token released successfully");
    }
  });
}

main();
