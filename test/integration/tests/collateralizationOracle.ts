import {
  CollateralizationOracle,
  CollateralizationOracleWrapper,
  NamedStaticPCVDepositWrapper
} from '@custom-types/contracts';
import { NamedAddresses, NamedContracts } from '@custom-types/types';
import collateralizationAddresses from '@protocol/collateralizationOracle';
import proposals from '@protocol/proposalsConfig';
import { expectApprox, overwriteChainlinkAggregator } from '@test/helpers';
import { TestEndtoEndCoordinator } from '@test/integration/setup';
import chai, { expect } from 'chai';
import CBN from 'chai-bn';
import { solidity } from 'ethereum-waffle';
import { ethers } from 'hardhat';

describe('e2e-collateralization', function () {
  let contracts: NamedContracts;
  let contractAddresses: NamedAddresses;
  let deployAddress: string;
  let e2eCoord: TestEndtoEndCoordinator;
  let doLogging: boolean;

  const allNames = [];
  const eth = ethers.constants.WeiPerEther;

  before(async () => {
    chai.use(CBN(ethers.BigNumber));
    chai.use(solidity);
  });

  before(async function () {
    // Setup test environment and get contracts
    const version = 1;
    deployAddress = (await ethers.getSigners())[0].address;
    if (!deployAddress) throw new Error(`No deploy address!`);

    doLogging = Boolean(process.env.LOGGING);

    const config = {
      logging: doLogging,
      deployAddress: deployAddress,
      version: version
    };

    e2eCoord = new TestEndtoEndCoordinator(config, proposals);

    doLogging && console.log(`Loading environment...`);
    ({ contracts, contractAddresses } = await e2eCoord.loadEnvironment());
    doLogging && console.log(`Environment loaded.`);

    const namedStaticPCVDepositWrapper: NamedStaticPCVDepositWrapper =
      contracts.namedStaticPCVDepositWrapper as NamedStaticPCVDepositWrapper;
    const numDeposits = Number(await namedStaticPCVDepositWrapper.numDeposits());
    for (let i = 0; i < numDeposits; i++) {
      const deposit = await namedStaticPCVDepositWrapper.pcvDeposits(i);
      allNames.push(deposit.depositName);
    }
  });

  describe('Named PCVDeposit Wrapper', async function () {
    it('can fetch all underlying token addresses', async function () {
      const namedStaticPCVDepositWrapper: NamedStaticPCVDepositWrapper =
        contracts.namedStaticPCVDepositWrapper as NamedStaticPCVDepositWrapper;

      const allTokenAddresses = await namedStaticPCVDepositWrapper.getAllUnderlying();
      expect(allTokenAddresses.length).to.be.eq(allNames.length);

      for (let i = 0; i < allTokenAddresses.length; i++) {
        const deposit = await namedStaticPCVDepositWrapper.pcvDeposits(i);
        expect(allTokenAddresses[i]).to.equal(deposit.underlyingToken);
      }
    });

    it('number of deposits is correct', async function () {
      const namedStaticPCVDepositWrapper: NamedStaticPCVDepositWrapper =
        contracts.namedStaticPCVDepositWrapper as NamedStaticPCVDepositWrapper;
      const numDeposits = Number(await namedStaticPCVDepositWrapper.numDeposits());
      expect(numDeposits).to.be.eq(allNames.length);
    });

    it('can add a new deposit', async function () {
      const namedStaticPCVDepositWrapper: NamedStaticPCVDepositWrapper =
        contracts.namedStaticPCVDepositWrapper as NamedStaticPCVDepositWrapper;
      const startingFeiUSDValues = await namedStaticPCVDepositWrapper.resistantBalanceAndFei();
      const feiAmount = eth.mul(10_000);

      await namedStaticPCVDepositWrapper.addDeposit({
        depositName: 'intangible brand value',
        underlyingToken: namedStaticPCVDepositWrapper.address,
        underlyingTokenAmount: 10_000_000,
        feiAmount,
        usdAmount: 0
      });

      const endingFeiUSDValues = await namedStaticPCVDepositWrapper.resistantBalanceAndFei();
      const numDeposits = await namedStaticPCVDepositWrapper.numDeposits();

      expect(numDeposits).to.be.eq(allNames.length + 1);
      expect(startingFeiUSDValues[0]).to.be.eq(endingFeiUSDValues[0]);
      expect(startingFeiUSDValues[1].add(feiAmount)).to.be.eq(endingFeiUSDValues[1]);
    });

    it('can remove an existing deposit', async function () {
      const namedStaticPCVDepositWrapper: NamedStaticPCVDepositWrapper =
        contracts.namedStaticPCVDepositWrapper as NamedStaticPCVDepositWrapper;
      await namedStaticPCVDepositWrapper.removeDeposit(Number(await namedStaticPCVDepositWrapper.numDeposits()) - 1);
      const numDeposits = Number(await namedStaticPCVDepositWrapper.numDeposits());
      expect(numDeposits).to.be.eq(allNames.length);
    });
  });

  describe('Collateralization Oracle', function () {
    it('token deposits should have correct cardinality', async function () {
      const collateralizationOracle = contracts.collateralizationOracle;

      const addresses = Object.keys(collateralizationAddresses);

      for (let i = 0; i < addresses.length; i++) {
        const element = contractAddresses[addresses[i]];

        const numTokens = (await collateralizationOracle.getDepositsForToken(element)).length;
        doLogging && console.log(`Address count for token ${addresses[i]}: ${numTokens}`);
        expect(numTokens).to.be.equal(
          collateralizationAddresses[addresses[i]].length,
          'bad number of deposits for token ' +
            element +
            ' - expected ' +
            collateralizationAddresses[addresses[i]].length +
            ' but got ' +
            numTokens
        );
      }
    });

    it('token deposits should contain correct addresses', async function () {
      const collateralizationOracle = contracts.collateralizationOracle;

      const addresses = Object.keys(collateralizationAddresses);

      for (let i = 0; i < addresses.length; i++) {
        const element = addresses[i];

        const deposits = await collateralizationOracle.getDepositsForToken(contractAddresses[element]);

        for (let i = 0; i < collateralizationAddresses[element].length; i++) {
          const contractAddress = contractAddresses[collateralizationAddresses[element][i]];
          doLogging && console.log(`${element} contract address: ${contractAddress}`);
          expect(deposits).to.contain(contractAddress);
        }
      }
    });
  });

  describe('Collateralization Oracle Wrapper', async function () {
    it('collateralization changes register after an update to the named pcv deposit wrapper', async function () {
      const collateralizationOracleWrapper: CollateralizationOracleWrapper =
        contracts.collateralizationOracleWrapper as CollateralizationOracleWrapper;
      const collateralizationOracle: CollateralizationOracle =
        contracts.collateralizationOracle as CollateralizationOracle;
      const namedStaticPCVDepositWrapper: NamedStaticPCVDepositWrapper =
        contracts.namedStaticPCVDepositWrapper as NamedStaticPCVDepositWrapper;

      // set Chainlink ETHUSD to a fixed 4,000$ value
      await overwriteChainlinkAggregator(contractAddresses.chainlinkEthUsdOracle, '400000000000', '8');

      await collateralizationOracleWrapper.update();

      const beforeBalance = await namedStaticPCVDepositWrapper.balance();

      // Make sure wrapper = oracle after update
      const beforeStats = await collateralizationOracle.pcvStats();
      const wrapperStats = await collateralizationOracleWrapper.pcvStats();

      expect(wrapperStats[0]).to.be.bignumber.equal(beforeStats[0]);
      expect(wrapperStats[1]).to.be.bignumber.equal(beforeStats[1]);
      expect(wrapperStats[2]).to.be.bignumber.equal(beforeStats[2]);

      // Zero out all of the named static balances
      const numDeposits = Number(await namedStaticPCVDepositWrapper.numDeposits());
      for (let i = 0; i < numDeposits; i++) {
        await namedStaticPCVDepositWrapper.removeDeposit(0);
      }

      const resistantBalanceAndFei = await namedStaticPCVDepositWrapper.resistantBalanceAndFei();
      expect(resistantBalanceAndFei[0]).to.be.eq(0);
      expect(resistantBalanceAndFei[1]).to.be.eq(0);

      // Make sure wrapper unchanged
      const wrapperStatsAfter = await collateralizationOracleWrapper.pcvStats();
      expect(wrapperStatsAfter[0]).to.be.bignumber.equal(beforeStats[0]);
      expect(wrapperStatsAfter[1]).to.be.bignumber.equal(beforeStats[1]);
      expect(wrapperStatsAfter[2]).to.be.bignumber.equal(beforeStats[2]);

      // Make sure wrapper current matches the true value
      const wrapperStatsAfterCurrent = await collateralizationOracleWrapper.pcvStatsCurrent();
      expectApprox(wrapperStatsAfterCurrent[0], beforeStats[0].sub(beforeBalance));
      expectApprox(wrapperStatsAfterCurrent[1], beforeStats[1]);
      expectApprox(wrapperStatsAfterCurrent[2], beforeStats[2].sub(beforeBalance));

      // Make sure wrapper matches the true value after another update
      await collateralizationOracleWrapper.update();

      const afterStats = await collateralizationOracle.pcvStats();

      const wrapperStatsAfterUpdate = await collateralizationOracleWrapper.pcvStats();
      expectApprox(wrapperStatsAfterUpdate[0], afterStats[0]);
      expectApprox(wrapperStatsAfterUpdate[1], afterStats[1]);
      expectApprox(wrapperStatsAfterUpdate[2], afterStats[2]);
    });
  });
});
