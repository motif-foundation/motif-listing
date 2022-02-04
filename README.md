## Motif - Listing
 
1. Install and build repo
	update package,json with latest motif asset
		@motif-foundation/asset@1.0.x
	yarn
	yarn build
2. Deploy contracts to blockchain
	add wmotif address to addresses/7018.json
	remove the listing addresses from addresses/7018.json
	update .env.prod with private key and rpc
	yarn deploy --chainId 7018
	check if addresses/7018.json filled with addresses
3. Deploy library to npm
	update package.json with the next version and username
	npm login (if not logged in)
	npm pack
	npm publish --access=public
 
