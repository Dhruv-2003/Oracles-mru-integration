import { State, StateMachine } from "@stackr/sdk/machine";
import { solidityPackedKeccak256 } from "ethers";

import * as genesisState from "../../genesis-state.json";
import { transitions } from "./transitions";
import MerkleTree from "merkletreejs";

export type Balances = {
  [address: string]: number;
};

export type BridgeStateType = {
  token1Balance: Balances;
  token2Balance: Balances;
  price: number;
};

export class BridgeTree {
  public bridgeState: BridgeStateType;

  public merkleTreeToken1: MerkleTree;
  public merkleTreeToken2: MerkleTree;

  constructor(bridgeState: BridgeStateType) {
    const { merkleTreeToken1, merkleTreeToken2 } = this.createTree(bridgeState);
    this.merkleTreeToken1 = merkleTreeToken1;
    this.merkleTreeToken2 = merkleTreeToken2;

    this.bridgeState = bridgeState;
  }

  createTree(bridgeState: BridgeStateType) {
    const hashedLeavesToken1Balance = Object.entries(
      bridgeState.token1Balance
    ).map((leaf) => {
      return solidityPackedKeccak256(
        ["address", "uint256"],
        [leaf[0], leaf[1]]
      );
    });

    const hashedLeavesToken2Balance = Object.entries(
      bridgeState.token2Balance
    ).map((leaf) => {
      return solidityPackedKeccak256(
        ["address", "uint256"],
        [leaf[0], leaf[1]]
      );
    });

    return {
      merkleTreeToken1: new MerkleTree(hashedLeavesToken1Balance),
      merkleTreeToken2: new MerkleTree(hashedLeavesToken2Balance),
    };
  }
}

export class BridgeState extends State<BridgeStateType, BridgeTree> {
  constructor(state: BridgeStateType) {
    super(state);
  }

  transformer() {
    return {
      wrap: () => {
        return new BridgeTree(this.state);
      },
      unwrap: (wrappedState: BridgeTree) => {
        return wrappedState.bridgeState;
      },
    };
  }

  getRootHash(): string {
    return solidityPackedKeccak256(
      ["bytes32", "bytes32", "uint"],
      [
        this.transformer().wrap().merkleTreeToken1.getHexRoot(),
        this.transformer().wrap().merkleTreeToken2.getHexRoot(),
        this.state.price,
      ]
    );
  }
}

const machine = new StateMachine({
  id: "bridge",
  stateClass: BridgeState,
  initialState: genesisState.state as BridgeStateType,
  on: transitions,
});

export { machine };
