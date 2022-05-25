import { ProposalCategory, ProposalsConfigMap } from '@custom-types/types';

// import fip_xx_proposal from '@proposals/description/fip_xx';
import balancer_gauge_fix from '@proposals/description/balancer_gauge_fix';
import fip_107 from '@proposals/description/fip_107';

const proposals: ProposalsConfigMap = {
  balancer_gauge_fix: {
    deploy: false, // deploy flag for whether to run deploy action during e2e tests or use mainnet state
    totalValue: 0, // amount of ETH to send to DAO execution
    proposal: balancer_gauge_fix, // full proposal file, imported from '@proposals/description/fip_xx.ts'
    proposalId: null,
    affectedContractSignoff: [
      'tribalCouncilTimelock',
      'balancerDepositFeiWeth',
      'balancerLensBpt30Fei70Weth',
      'pcvGuardianNew',
      'core',
      'balancerGaugeStaker',
      'collateralizationOracle',
      'pcvGuardianNew'
    ],
    deprecatedContractSignoff: ['balancerLensBpt30Fei70WethOld'],
    category: ProposalCategory.TC
  },
  fip_107: {
    deploy: true, // deploy flag for whether to run deploy action during e2e tests or use mainnet state
    totalValue: 0, // amount of ETH to send to DAO execution
    proposal: fip_107, // full proposal file, imported from '@proposals/description/fip_xx.ts'
    proposalId: null,
    affectedContractSignoff: [],
    deprecatedContractSignoff: [],
    category: ProposalCategory.TC
  }
};

export default proposals;
