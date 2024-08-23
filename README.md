# Integration of Oracles (Chainlink, Chronicle, & Pyth) with Stackr Micro Rollups

## Overview

This guide provides basic instructions for integrating Oracle services with Stackr Micro Rollups (MRU) using a bridge contract. This setup allows you to feed external price data into the rollup, enabling state transitions based on live data from Chainlink, Chronicle, or Pyth.

## What are Oracles

Oracles are external data sources that provide real-world information to blockchain networks. They act as a bridge between off-chain data and on-chain smart contracts, allowing contracts to execute based on external events or information.

There are several type of data feeds offered by oracles like Price Feeds, Proof of reserve Feeds, Entropy, etc. from the following oracle networks -

- [**Chainlink**](https://chain.link/)
- [**Pyth**](https://www.pyth.network/)
- [**Chronicle**](https://chroniclelabs.org/)

## Prerequisites

Before you begin this tutorial, please ensure you go through the following:

- Basic understanding of the Stackr Micro rollup framework: [Zero to One](/build/zero-to-one/getting-started)
- Familiarity with Solidity and smart contract deployment
- Knowledge & access to the preferred oracle service: [What are Blockchain Oracle](https://chain.link/education/blockchain-oracles)

## How to build ?

### Step 1: Initialize the Rollup

1. Initialise a MRU with Bridge Template: Start by initialising MRU using the `@stackr/cli` and choosing the **Bridge** template, and adding a name for your project.

```bash
$ npx @stackr/cli@latest init

        _             _                        _ _
    ___| |_ __ _  ___| | ___ __            ___| (_)
   / __| __/ _` |/ __| |/ / '__|  _____   / __| | |
   \__ \ || (_| | (__|   <| |    |_____| | (__| | |
   |___/\__\__,_|\___|_|\_\_|             \___|_|_|
 

? Pick a template > Bridge
? Project Name > Oracle-bridge


$ cd Oracle-bridge
```

2. Configure the State: Modify the state of the MRU file to include variables for storing Oracle price inputs.

```typescript
type State = {
  ...,
  oraclePrice : string;
}
```

3. Add State Transition Logic: Implement a state transition function that updates the rollup's state based on the Oracle's price feed.

```typescript
const updateOraclePrice: STF<BridgeState, UpdateOracelPriceInput> = {
  handler: ({ state, inputs, msgSender }) => {
    const { price, timestamp } = inputs;

    state.bridgeState.price = price;

    return state;
  },
};
```

Also add a new actionSchema for this action

```solidity
export const UpdateOraclePriceSchema = new ActionSchema("updateOraclePrice", {
  price: SolidityType.STRING,
  timestamp: SolidityType.UINT,
});
```

### Step 2 Create the Bridge Contract

1. Setup basic bridge contract : A `TokenBridge.sol` is by default added in the project template for reference. Bridge contract can call `createTicket` on the `AppInbox` to initiate the message bridging.

2. Integrate with Oracle: Depending on the Oracle service, integrate the appropriate API or contract to retrieve live price data.

You can replace the address according the pair and the network of you choice in the above examples
 
Example for Chainlink
```solidity 
function getLatestPrice() internal view returns (uint256) {
    priceFeed = AggregatorV3Interface(
            0x694AA1769357215DE4FAC081bf1f309aDC325306
        );
    (, int256 price, , , ) = priceFeed.latestRoundData();
    return price;
}
```

Example for Chronicle
```solidity 
function getLatestPrice() internal view returns (uint256) {
    chronicle = IChronicle(
            address(0xdd6D76262Fd7BdDe428dcfCd94386EbAe0151603)
        );
    uint price = chronicle.read();
    return price;
}
```

Example for Pyth
```solidity 
function getLatestPrice() internal view returns (uint256) {
    bytes32 priceFeedId = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace; // ETH/USD
    PythStructs.Price memory price = pyth.getPriceNoOlderThan(
            priceFeedId,
            60
        );
    return price.price;
}
```


3. Implement a function to creata a ticket with the price Feed and the identifier `ORACLE_ETH_USDC`

```solidity
function syncPriceWithChainlink() external view returns (uint256) {
    int price = getLatestPrice();
    
    bytes memory message = abi.encode(price);
    bytes32 identifier = keccak256("ORACLE_ETH_USDC");
    
    ITicketFactory(appInbox).createTicket(identifier, msg.sender, message);
}
```

Now the contract are ready to be deployed and you can use Remix to deploy them on `Sepolia` testnet where the AppInbox is deployed as well.

### Step 3 Setup the MRU for oracle bridge

1. Register the Bridge contract: Using CLI add the bridge contract to the current appInbox 

```bash 
npx @stackr/cli add bridge

? Bridge Contract Address
```

2. Implement Ticket Handling: Modify the rollup to process tickets from the OracleBridge, updating the rollup state accordingly.

```typescript
Bridge.init(rollup, {
    handlers: {
        ORACLE_ETH_USDC: async (args) => {
        const [_price] = abiCoder.decode(["int"], args.data);
        console.log("Updating oracle price to", _price);

        const inputs = {
          price: _price.toString(),
          timestamp: Date.now(),
        };

        const signature = await signMessage(
          operator,
          UpdateOraclePriceSchema,
          inputs
        );
        const action = UpdateOraclePriceSchema.actionFrom({
          inputs,
          signature,
          msgSender: operator.address,
        });

        return {
          transitionName: "updateOraclePrice",
          action: action,
        };
      },
    }
})
```

Other functions can be further implemented to handle tickets related to token bridging and building a DEX using the price feed from the Oracle 

## Project Structure 

```
├── src
│   ├── stackr
│   │   ├── machine.ts ( state and state machine)
│   │   ├── actions.ts ( action schemas )
│   │   ├── transitions.ts  ( transition functions )
│   │ 
│   ├── contract ( oracle bridge contracts )
│   │   ├── TokenBridgeChainlink.sol
│   │   ├── TokenBridgeChronicle.sol
│   │   ├── TokenBridgePyth.sol
│   │ 
│   ├── index.ts ( mru & bridge ticket handler )
│── stackr.config.ts
│── deployment.json
```

## How to run?

### Run using Node.js :rocket:

```bash
npm start
```

### Run using Docker :whale:

- Build the image using the following command:

```bash
# For Linux
docker build -t {{projectName}}:latest .

# For Mac with Apple Silicon chips
docker buildx build --platform linux/amd64,linux/arm64 -t {{projectName}}:latest .
```

- Run the Docker container using the following command:

```bash
# If using SQLite as the datastore
docker run -v ./db.sqlite:/app/db.sqlite -p <HOST_PORT>:<CONTAINER_PORT> --name={{projectName}} -it {{projectName}}:latest

# If using other URI based datastores
docker run -p <HOST_PORT>:<CONTAINER_PORT> --name={{projectName}} -it {{projectName}}:latest
```
