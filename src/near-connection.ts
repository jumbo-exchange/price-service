import { connect } from 'near-api-js';
import { MergeKeyStore } from 'near-api-js/lib/key_stores';
import { configService } from './config.service';

const config = {
  networkId: configService.getNetworkId(),
  nodeUrl: configService.getNodeUrl(),
  headers: {},
  keyStore: new MergeKeyStore([]), // Keystore can be empty since we don't send any transactions
};

export async function initializeNearConnection() {
  const near = await connect(config);
  const viewAccount = await near.account('');
  return {
    viewFunction: (methodName: string, args?: object) =>
      viewAccount.viewFunction(
        configService.getContractUrl(),
        methodName,
        args,
      ),
    getFtMetadata: (tokenName: string) =>
      viewAccount.viewFunction(tokenName, 'ft_metadata'),
  };
}
