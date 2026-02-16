/** @param {NS} ns */
export async function main(ns) {
    var minCash = 1000000;
    var buyAt = 0.55;
    var sellAt = 0.50;
    
    ns.tprint("stock bot started");
    
    while (true) {
        var stocks = ns.stock.getSymbols();
        
        for (var i = 0; i < stocks.length; i++) {
            var stock = stocks[i];
            var pos = ns.stock.getPosition(stock);
            var forecast = ns.stock.getForecast(stock);
            var max = ns.stock.getMaxShares(stock);
            var ask = ns.stock.getAskPrice(stock);
            var bid = ns.stock.getBidPrice(stock);
            var cash = ns.getServerMoneyAvailable("home");
            
            if (pos[0] > 0) {
                if (forecast < sellAt) {
                    ns.stock.sellStock(stock, pos[0]);
                    ns.tprint("SOLD " + pos[0] + " " + stock + " at $" + bid);
                }
            } else {
                if (forecast > buyAt && cash > minCash) {
                    var canAfford = Math.floor((cash - minCash) / ask);
                    var toBuy = Math.min(canAfford, max);
                    
                    if (toBuy > 0) {
                        ns.stock.buyStock(stock, toBuy);
                        ns.tprint("BOUGHT " + toBuy + " " + stock + " at $" + ask);
                    }
                }
            }
        }
        
        await ns.sleep(6000);
    }
}
