// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.23;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

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

    function transfer(address _to, uint256 _value) external returns (bool);
}

contract TokenBridge {
    IPyth pyth;

    address appInbox;
    address manager;

    mapping(address => mapping(address => uint)) public tokenClaimBalances;

    constructor(address _appInbox, address manager) {
        appInbox = _appInbox;
        manager = _manager;

        pyth = IPyth(address(0xDd24F84d36BF92C65F92307595335bdFab5Bbd21));
    }

    // READ FUNCTIONS

    function getPythDataFeedLatestAnswer() public view returns (int) {
        bytes32 priceFeedId = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace; // ETH/USD
        PythStructs.Price memory price = pyth.getPriceNoOlderThan(
            priceFeedId,
            60
        );
        return price.price;
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
    function bridgeTokens(
        address _token,
        address _to,
        uint _amount
    ) external payable {
        require(_to != address(0), "bridgeTokens/zero-address");

        if (_token == address(0)) {
            require(msg.value > 0, "bridgeTokens/zero-amount");
            require(msg.value == _amount, "bridgeTokens/eth-amount");

            bytes memory message = abi.encode(_to, msg.value);
            bytes32 identifier = keccak256("BRIDGE_ETH");

            ITicketFactory(appInbox).createTicket(
                identifier,
                msg.sender,
                message
            );
        } else {
            require(msg.value == 0, "bridgeTokens/eth-amount");
            require(_amount > 0, "bridgeTokens/zero-amount");

            // NOTE: Need the approval of tokens
            IERC20(_token).transferFrom(msg.sender, address(this), _amount);

            bytes memory message = abi.encode(_token, _to, _amount);
            bytes32 identifier = keccak256("BRIDGE_ERC20");

            ITicketFactory(appInbox).createTicket(
                identifier,
                msg.sender,
                message
            );
        }
    }

    // called By the Keeper , can be done by anyone else as well
    function syncPriceWithPyth() external payable {
        int price = getPythDataFeedLatestAnswer();

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
