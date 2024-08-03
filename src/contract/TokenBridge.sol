// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.23;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

interface ITicketFactory {
    function createTicket(
        bytes32 _identifier,
        address _msgSender,
        bytes memory _message
    ) external;
}

interface IERC20 {
    function transferFrom(
        address _from,
        address _to,
        uint256 _value
    ) external returns (bool);
}

contract TokenBridge {
    AggregatorV3Interface internal dataFeed;

    address appInbox;
    address manager;

    mapping(address => mapping(address => uint)) public tokenClaimBalances;

    constructor(address _appInbox, address _manager) {
        appInbox = _appInbox;
        manager = _manager;

        // ETH USD Pair
        dataFeed = AggregatorV3Interface(
            0x694AA1769357215DE4FAC081bf1f309aDC325306
        );
    }

    // READ FUNCTIONS

    function getChainlinkDataFeedLatestAnswer() public view returns (int) {
        // prettier-ignore
        (
            /* uint80 roundID */,
            int answer,
            /*uint startedAt*/,
            /*uint timeStamp*/,
            /*uint80 answeredInRound*/
        ) = dataFeed.latestRoundData();
        return answer;
    }

    function getTokensClaimBalance(
        address token,
        address _to
    ) external view returns (uint) {
        return tokenClaimBalances[token][_to];
    }

    // MODIFIER

    modifier onlyManager() {
        require(msg.sender == manager, "onlyManager");
        _;
    }

    // WRITE EXTERNAL FUNCTIONS

    // User can bridge tokens from sepolia to the MRU
    // Funds are locked in the contract until the MRU contract releases them
    function bridgeTokens(address _token, address _to) external payable {
        require(_to != address(0), "bridgeTokens/zero-address");

        if (_token == address(0)) {
            require(msg.value > 0, "bridgeTokens/zero-amount");

            bytes memory message = abi.encode(_to, msg.value);
            bytes32 identifier = keccak256("BRIDGE_ETH");

            ITicketFactory(appInbox).createTicket(
                identifier,
                msg.sender,
                message
            );
        } else {
            require(msg.value == 0, "bridgeTokens/eth-amount");

            // NOTE: Need the approval of tokens
            IERC20(_token).transferFrom(msg.sender, address(this), msg.value);

            bytes memory message = abi.encode(_to, msg.value);
            bytes32 identifier = keccak256("BRIDGE_ERC20");

            ITicketFactory(appInbox).createTicket(
                identifier,
                msg.sender,
                message
            );
        }
    }

    // called By the Keeper , can be done by anyone else as well
    function syncPriceWithChainlink() external payable {
        int price = getChainlinkDataFeedLatestAnswer();

        bytes memory message = abi.encode(price);
        bytes32 identifier = keccak256("ORACLE_ETH_USDC");

        ITicketFactory(appInbox).createTicket(identifier, msg.sender, message);
    }

    // tokens released by the MRU handler / syncer
    function releaseTokens(
        address token,
        address _to,
        uint _amount
    ) external onlyManager {
        require(_to != address(0), "bridgeTokens/zero-address");
        require(_amount > 0, "bridgeTokens/zero-amount");

        tokenClaimBalances[token][_to] += _amount;
    }

    // claim tokens from the contract for the tokens released by the MRU handler
    function claimTokens(address token, address _to, uint amount) external {
        require(_to != address(0), "claimTokens/zero-address");
        require(amount > 0, "claimTokens/zero-amount");

        uint balance = tokenClaimBalances[msg.sender][_to];
        require(balance >= amount, "claimTokens/insufficient-balance");

        tokenClaimBalances[msg.sender][_to] -= amount;

        if (token == address(0)) {
            payable(_to).transfer(amount);
        } else {
            IERC20(token).transfer(_to, amount);
        }
    }
}
