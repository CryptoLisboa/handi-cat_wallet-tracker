import { AccountInfo, Connection, ParsedTransactionWithMeta, PublicKey, SystemProgram } from "@solana/web3.js";
import { connection } from "../providers/solana";
// @ts-expect-error
import { getAccount } from "@solana/spl-token";
import { TokenListProvider } from "@solana/spl-token-registry"

import axios from "axios";
import { PoolInfoLayout, SqrtPriceMath } from "@raydium-io/raydium-sdk";
import { SwapType } from "../types/swap-types";
import dotenv from "dotenv"
dotenv.config()

export class Utils {
    constructor() {}
    public async getTokenMintAddress(tokenAddress: string) {
        try {
          const tokenPublicKey = new PublicKey(tokenAddress);
          const accountInfo = await getAccount(connection, tokenPublicKey);
          return accountInfo.mint.toBase58();
        } catch (error) {
          console.error(`Error fetching mint address for token ${tokenAddress}:`, error);
          return null;
        }
      }

    public async getTokenMintAddressWithFallback(transactions: any) {
        let tokenOutMint = null;
      
        if (transactions[0]?.info?.destination) {
          tokenOutMint = await this.getTokenMintAddress(transactions[0].info.destination);
        }
      
        if (!tokenOutMint && transactions[0]?.info?.source) {
          tokenOutMint = await this.getTokenMintAddress(transactions[0].info.source);
        }
      
        return tokenOutMint;
    }

    public calculateNativeBalanceChanges(transactionDetails: (ParsedTransactionWithMeta | null)[]) {
        const meta = transactionDetails[0] && transactionDetails[0].meta;
        
        if (!meta) {
          console.log('No meta information available');
          return;
        }
      
        const preBalances = meta.preBalances;
        const postBalances = meta.postBalances;
      
        if (!preBalances || !postBalances) {
          console.log('No balance information available');
          return;
        }
      
        const balanceChanges = [];
      
        // Calculate SOL balance changes for each account
        for (let i = 0; i < preBalances.length; i++) {
          const preBalance = preBalances[i];
          const postBalance = postBalances[i];
          const solDifference = (postBalance - preBalance) / 1e9; // Convert lamports to SOL
          
          if (solDifference !== 0) {
            balanceChanges.push({
              accountIndex: i,
              preBalance: preBalance / 1e9, // Convert to SOL
              postBalance: postBalance / 1e9, // Convert to SOL
              change: solDifference
            });
          }
        }
      
        // Log the results
        if (balanceChanges.length > 0) {
          const firstChange = balanceChanges[0];
          // console.log(`Account Index ${firstChange.accountIndex} native balance change:`);
          // console.log(`Pre Balance: ${firstChange.preBalance} SOL`);
          // console.log(`Post Balance: ${firstChange.postBalance} SOL`);
          // console.log(`Change: ${firstChange.change} SOL`);
          // console.log('-----------------------------------');
          const type = firstChange.change > 0 ? 'sell' : 'buy'
          return {
            type,
            balanceChange: firstChange.change
          }
        } else {
          console.log('No balance changes found');
          return {
            type: '',
            balanceChange: ''
          }
        }
      }
    
      public async getSolPriceGecko(): Promise<number | undefined> {
       try {
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd')

        const data = await response.data

        const solanaPrice = data.solana.usd

         return solanaPrice
       } catch (error) {
        console.log('GET_SOL_PRICE_ERROR')
         return 
       }
      }

      public async getSolPriceNative() {
        const id = new PublicKey('8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj')

        const accountInfo = await connection.getAccountInfo(id)

        if (accountInfo === null) {
          console.log('get pool info error')
          return
        }

        const poolData = PoolInfoLayout.decode(accountInfo.data)

        const solPrice = SqrtPriceMath.sqrtPriceX64ToPrice(poolData.sqrtPriceX64, poolData.mintDecimalsA, poolData.mintDecimalsB).toFixed(2)

        // console.log('current price -> ', solPrice)

        return solPrice
      }

      public async getTokenBalance(tokenAccountAddress: PublicKey) {
        try {
          const tokenBalance = await connection.getTokenAccountBalance(tokenAccountAddress);
          return tokenBalance.value.amount;
        } catch (error) {
          console.error('Error fetching token balance:', error);
          return
        }
      }

      public async getTokenPrice(txInstructions: ParsedTxInfo[], type: 'buy' | 'sell'): Promise<number | undefined> {
         if (type === 'buy') {
          const tokenAccountAddress = new PublicKey(txInstructions[1].info.source);
          const tokenAccountAddressWrappedSol = new PublicKey(txInstructions[0].info.destination);

          const splTokenBalance: any = await this.getTokenBalance(tokenAccountAddress);
          const wrappedSolBalance: any = await this.getTokenBalance(tokenAccountAddressWrappedSol);
          const solPriceInUsd: any = await this.getSolPriceNative();
      
          const priceOfSPLTokenInSOL = (wrappedSolBalance / 1_000_000_000) / (splTokenBalance / 1_000_000);
          const priceOfSPLTokenInUSD = priceOfSPLTokenInSOL * solPriceInUsd;

          console.log('PRICE IN USD NORMAL', priceOfSPLTokenInUSD)
          console.log('PRICE IN USD FIXED', priceOfSPLTokenInUSD.toFixed(10))
          console.log('SOL PRICE IN USD', solPriceInUsd)

          return priceOfSPLTokenInUSD
         } else if (type === 'sell') {
          const tokenAccountAddress = new PublicKey(txInstructions[0].info.destination);
          const tokenAccountAddressWrappedSol = new PublicKey(txInstructions[1].info.source);

          const splTokenBalance: any = await this.getTokenBalance(tokenAccountAddress);
          const wrappedSolBalance: any = await this.getTokenBalance(tokenAccountAddressWrappedSol);
          const solPriceInUsd: any = await this.getSolPriceNative();
      
          const priceOfSPLTokenInSOL = (wrappedSolBalance / 1_000_000_000) / (splTokenBalance / 1_000_000);
          const priceOfSPLTokenInUSD = priceOfSPLTokenInSOL * solPriceInUsd;

          console.log('PRICE IN USD NORMAL', priceOfSPLTokenInUSD)
          console.log('PRICE IN USD FIXED', priceOfSPLTokenInUSD.toFixed(10))
          console.log('SOL PRICE IN USD', solPriceInUsd)
          
          return priceOfSPLTokenInUSD
         }

         return
      }

      public async getTokenMktCap(tokenPrice: number, tokenMint: string) {
         const mintPublicKey = new PublicKey(tokenMint);
         const tokenSupply = await connection.getTokenSupply(mintPublicKey);
         const supplyValue = tokenSupply.value.uiAmount

         if (!supplyValue) {
           return
         }

         const tokenMarketCap = supplyValue * tokenPrice

         console.log('TOKEN_MARKET_CAP', tokenMarketCap)
         return tokenMarketCap
      }
}