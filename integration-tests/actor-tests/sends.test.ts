import { utils, Wallet, BigNumber } from 'ethers'
import { expect } from 'chai'
import { actor, setupRun, setupActor, run } from './lib/convenience'
import { OptimismEnv } from '../test/shared/env'

interface Context {
  wallet: Wallet
}

actor('Value sender', () => {
  let env: OptimismEnv

  setupActor(async () => {
    env = await OptimismEnv.new()
  })

  setupRun(async () => {
    const wallet = Wallet.createRandom()
    await env.l2Wallet.sendTransaction({
      to: wallet.address,
      value: utils.parseEther('0.01'),
    })
    return {
      wallet: wallet.connect(env.l2Wallet.provider),
    }
  })

  run(async (b, ctx: Context) => {
    const randWallet = Wallet.createRandom().connect(env.l2Wallet.provider)
    await b.bench('send funds', async () => {
      await ctx.wallet.sendTransaction({
        to: randWallet.address,
        value: 0x42,
      })
    })
    expect(await randWallet.getBalance()).to.deep.equal(BigNumber.from(0x42))
    await b.bench('withdraw funds', async () => {
      // do the withdrawal
    })
  })
})
