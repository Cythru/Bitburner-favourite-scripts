/** @param {NS} ns
 * LazyCorp.js - Autocorp for Bitburner (v1.2 - dashboard display)
 * By a lazy dev who grinded anyway.
 * Starts corp, expands, hires, produces, upgrades. Runs forever.
 * Run on home: run LazyCorp.js
 * Profits? Yeah, eventually. Need $150b to start.
**/

// ─── CORP DASHBOARD ────────────────────────────────────────────────
// Called at the top of every main loop iteration. Prints a compact
// snapshot of the corporation state to the tail window.
//
// Box width is 68 columns (66 inner + 2 border chars).
function printCorpDashboard(ns) {
    const W = 66; // inner width
    const R = "\x1b[0m";
    const cyan   = (s) => "\x1b[36m"  + s + R;
    const green  = (s) => "\x1b[32m"  + s + R;
    const yellow = (s) => "\x1b[33m"  + s + R;
    const red    = (s) => "\x1b[31m"  + s + R;
    const bold   = (s) => "\x1b[1m"   + s + R;
    const dim    = (s) => "\x1b[2m"   + s + R;
    const mag    = (s) => "\x1b[35m"  + s + R;

    // Format helpers (no ns.nFormat dependency — plain math)
    function fm(n) {
        if (!isFinite(n)) return "?";
        const abs = Math.abs(n), sign = n < 0 ? "-$" : "$";
        if (abs >= 1e15) return sign + (abs/1e15).toFixed(2) + "q";
        if (abs >= 1e12) return sign + (abs/1e12).toFixed(2) + "t";
        if (abs >= 1e9)  return sign + (abs/1e9).toFixed(2) + "b";
        if (abs >= 1e6)  return sign + (abs/1e6).toFixed(2) + "m";
        if (abs >= 1e3)  return sign + (abs/1e3).toFixed(2) + "k";
        return sign + abs.toFixed(0);
    }

    // Pad a raw string (no ANSI inside!) to exactly n chars
    function p(s, n) {
        s = String(s);
        return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
    }

    // Pad an ANSI-wrapped string: measure visible length, then right-pad
    function pa(s, n) {
        const vis = s.replace(/\x1b\[[0-9;]*m/g, "");
        const extra = n - vis.length;
        return extra > 0 ? s + " ".repeat(extra) : s;
    }

    // Horizontal rules
    const top  = cyan("\u2554" + "\u2550".repeat(W) + "\u2557");
    const mid  = cyan("\u2560" + "\u2550".repeat(W) + "\u2563");
    const bot  = cyan("\u255a" + "\u2550".repeat(W) + "\u255d");
    const row  = (content) => cyan("\u2551") + pa(content, W) + cyan("\u2551");

    // ── Gather data (safe) ──────────────────────────────────────────
    let corpName = "LazyCorp", revenue = 0, expenses = 0, cash = 0;
    let fundingRound = 0, isPublic = false, divData = [];
    let lastUpgrades = [];

    try {
        const corp = ns.corporation.getCorporation();
        corpName     = corp.name;
        revenue      = corp.revenue;
        expenses     = corp.expenses;
        cash         = corp.funds;
        fundingRound = corp.fundingRound ?? 0;
        isPublic     = corp.public ?? false;

        for (const divName of corp.divisions) {
            try {
                const div = ns.corporation.getDivision(divName);
                let totalEmp = 0, totalProd = 0;
                const cities = ["Aevum", "Chongqing", "Sector-12", "New Tokyo", "Ishima", "Volkov"];
                for (const city of cities) {
                    try {
                        const off = ns.corporation.getOffice(divName, city);
                        totalEmp += off.numEmployees;
                    } catch (_) {}
                }
                // Product tier = number of completed products
                const productCount = (div.products || []).length;
                const divRevenue   = div.lastCycleRevenue ?? 0;
                divData.push({
                    name: divName,
                    revenue: divRevenue,
                    employees: totalEmp,
                    products: productCount,
                    research: div.researchPoints ?? 0,
                    type: div.type ?? "?",
                });
            } catch (_) {}
        }

        // What upgrades are currently being bought (cheapest in queue)
        const upgrades = [
            "Smart Supply Chain", "DreamSense", "Wilson Analytics",
            "Nuoptimal Neurotuning", "Philips Medical", "FTC Rumors",
            "Big Chip", "Neural Networking", "Overclock", "Stiction", "Project Insight"
        ];
        for (const upg of upgrades) {
            try {
                const lvl  = ns.corporation.getUpgradeLevel(upg);
                const cost = ns.corporation.getUpgradeLevelCost(upg, lvl + 1);
                if (cost < cash * 0.02) lastUpgrades.push(upg + " → " + (lvl + 1));
                if (lastUpgrades.length >= 3) break;
            } catch (_) {}
        }
    } catch (_) {}

    const profit = revenue - expenses;

    // ── Render ──────────────────────────────────────────────────────
    const ts       = new Date().toLocaleTimeString();
    const titleStr = " LAZYCORP DASHBOARD  " + ts;
    const titlePad = Math.max(0, Math.floor((W - titleStr.length) / 2));
    ns.print(top);
    ns.print(row(" ".repeat(titlePad) + bold(mag(titleStr))));
    ns.print(mid);

    // Overview row
    const pubStr    = isPublic ? green("PUBLIC") : yellow("PRIVATE");
    const roundStr  = fundingRound > 0 ? "  Round " + fundingRound : "  No funding";
    const overStr   = " " + bold(cyan(p(corpName, 14))) + pubStr + dim(roundStr);
    ns.print(row(overStr));

    // Financials
    const revStr  = " Revenue:  " + green(fm(revenue) + "/s");
    const profStr = "   Profit: " + (profit >= 0 ? green(fm(profit) + "/s") : red(fm(profit) + "/s"));
    const cashStr = "   Cash:   " + yellow(fm(cash));
    ns.print(row(revStr + profStr + cashStr));

    // Blank separator
    ns.print(mid);

    // Divisions header
    ns.print(row(" " + bold(" Division          Type         Rev/s       Emp   Products")));
    ns.print(row(dim(" " + "\u2500".repeat(W - 1))));

    if (divData.length === 0) {
        ns.print(row("  " + dim("No divisions yet.")));
    } else {
        for (const d of divData) {
            // Clamp names, pad columns
            const dName  = p(d.name, 16);
            const dType  = p(d.type, 12);
            const dRev   = p(fm(d.revenue), 10);
            const dEmp   = p(String(d.employees), 5);
            const dProds = p(String(d.products), 8);
            const resStr = "  Rsch: " + dim(fm(d.research));
            const line   = " " + cyan(dName) + " " + dim(dType) + " " +
                           green(dRev) + " " + dEmp + " " + yellow(dProds) + resStr;
            ns.print(row(line));
        }
    }

    // Upgrades being purchased
    ns.print(mid);
    if (lastUpgrades.length > 0) {
        ns.print(row(" " + bold(" Queued upgrades:")));
        for (const u of lastUpgrades) ns.print(row("   " + yellow(u)));
    } else {
        ns.print(row("  " + dim("No cheap upgrades available this cycle.")));
    }

    ns.print(bot);
    ns.print(dim("  Cycle complete — sleeping 30s"));
}

export async function main(ns) {
    ns.disableLog('ALL');
    ns.tail();

    const cities = ["Aevum", "Chongqing", "Sector-12", "New Tokyo", "Ishima", "Volkov"];
    const productCity = "Sector-12"; // Main prod/sales city

    // Upgrades priority list - buy cheapest first, repeat
    const upgrades = [
        "Smart Supply Chain",     // Mat costs down
        "DreamSense",             // Marketing $$
        "Wilson Analytics",       // Sales $$
        "Nuoptimal Neurotuning",  // Prod up
        "Philips Medical",        // More prod
        "FTC Rumors",             // Competitors down
        "Big Chip",               // Warehouse
        "Neural Networking",      // Eng/ops
        "Overclock",              // Eng
        "Stiction",               // Ops
        "Project Insight"         // Mkt
    ];

    // Research priority
    const researches = [
        "Hi-Tech R&D Laboratory",
        "Market-TA.I",
        "Market-TA.II",
        "Market-Data Mines",
        "Auto-Party Software",
        "HR Enhancement"
    ];

    // Create corp if none
    if (!ns.corporation.hasCorporation()) {
        if (!ns.corporation.createCorporation("LazyCorp", "Tobacco")) {
            ns.tprint("ERROR: Can't create corp. Need $150b+?");
            return;
        }
        ns.tprint("💼 LazyCorp created. Grinding...");
    }

    let corp = ns.corporation.getCorporation();

    // Initial setup: first div Tobacco
    if (corp.divisions.length === 0) {
        ns.corporation.expandIndustry("Tobacco", "Tobacco");
        corp = ns.corporation.getCorporation();
    }

    // Expand to Pharma if not
    if (corp.divisions.length === 1) {
        ns.corporation.expandIndustry("Pharmaceutical", "Pharmaceutical");
    }

    while (true) {
        // ── Dashboard: print current state before doing anything ────
        ns.clearLog();
        printCorpDashboard(ns);

        corp = ns.corporation.getCorporation();

        for (let div of corp.divisions) {
            await manageDivision(ns, div, cities, productCity, upgrades, researches);
        }

        // Global upgrades/unlocks
        manageGlobal(ns, upgrades);

        // Lazy sleep - check every 30s
        await ns.sleep(30000);
    }
}

async function manageDivision(ns, div, cities, productCity, upgrades, researches) {
    // Expand to all cities if missing
    for (let city of cities) {
        if (!div.cities.includes(city)) {
            ns.corporation.expandCity(div.name, city);
        }
    }

    // Upgrade offices & hire - max affordable
    for (let city of cities) {
        let funds = ns.corporation.getCorporation().funds;
        let officeCost = ns.corporation.getUpgradeOfficeSizeCost(div.name, city, 3);

        // Upgrade office if cheap (≤5% of current funds)
        while (officeCost > 0 && officeCost < funds * 0.05) {
            ns.corporation.upgradeOfficeSize(div.name, city, 3);
            funds = ns.corporation.getCorporation().funds; // Refresh
            officeCost = ns.corporation.getUpgradeOfficeSizeCost(div.name, city, 3);
        }

        // Hire till full
        let office = ns.corporation.getOffice(div.name, city);
        while (office.numEmployees < office.size) {
            if (!ns.corporation.hireEmployee(div.name, city)) break;
            office = ns.corporation.getOffice(div.name, city);  // refresh count
        }

        // Set jobs: simple split - ops/eng heavy for prod, rest R&D/mgmt
        let numEmp = office.numEmployees;
        let ops  = Math.floor(numEmp * 0.4);
        let eng  = Math.floor(numEmp * 0.4);
        let mgmt = Math.floor(numEmp * 0.1);
        let bus  = Math.floor(numEmp * 0.05);
        let rnr  = numEmp - ops - eng - mgmt - bus;

        if (ns.corporation.hasResearched(div.name, "Market-TA.II")) {
            ns.corporation.setAutoJobAssignment(div.name, city, "Operations", ops);
            ns.corporation.setAutoJobAssignment(div.name, city, "Engineer", eng);
            ns.corporation.setAutoJobAssignment(div.name, city, "Management", mgmt);
            ns.corporation.setAutoJobAssignment(div.name, city, "Business", bus);
            if (rnr > 0) {
                ns.corporation.setAutoJobAssignment(div.name, city, "Research & Development", rnr);
            }
        } else {
            ns.corporation.setAutoJobAssignment(div.name, city, "Operations", ops);
            ns.corporation.setAutoJobAssignment(div.name, city, "Engineer", eng);
            ns.corporation.setAutoJobAssignment(div.name, city, "Research & Development", numEmp - ops - eng);
        }
    }

    // Warehouses - buy if missing, upgrade when almost full
    for (let city of cities) {
        if (!ns.corporation.hasWarehouse(div.name, city)) {
            const whCost = ns.corporation.getPurchaseWarehouseCost();
            if (whCost < ns.corporation.getCorporation().funds * 0.05) {
                ns.corporation.purchaseWarehouse(div.name, city);
            }
            continue;  // can't use it until next cycle
        }
        let wh = ns.corporation.getWarehouse(div.name, city);
        if (wh.sizeUsed / wh.size > 0.95) {
            let cost = ns.corporation.getUpgradeWarehouseCost(div.name, city);
            if (cost > 0 && cost < ns.corporation.getCorporation().funds * 0.02) {
                ns.corporation.upgradeWarehouse(div.name, city);
            }
        }
    }

    // Buy materials - keep stocks high for prod (safer version)
    const matNames = ["Food", "Energy", "Water", "Plants", "Hardware", "Robots", "AI Cores", "RealEstate"];
    for (let city of cities) {
        if (!ns.corporation.hasWarehouse(div.name, city)) continue;
        let wh = ns.corporation.getWarehouse(div.name, city);
        let funds = ns.corporation.getCorporation().funds;

        for (let mat of matNames) {
            let info = ns.corporation.getMaterial(div.name, city, mat);
            let stock = info.stored;  // v2 API: field is "stored" not "qty"
            let spaceLeft = wh.size - wh.sizeUsed;

            // Buy at most 10% of remaining space or 100 million units (safe cap)
            let buyAmt = Math.min(Math.floor(spaceLeft * 0.1), 100e6);
            let estCost = buyAmt * info.marketPrice * 1.1; // rough +10% buffer

            // buyMaterial sets a per-tick rate — must reset to 0 when done or it buys forever
            if (stock < wh.size * 0.5 && buyAmt > 0 && estCost < funds * 0.05) {
                ns.corporation.buyMaterial(div.name, city, mat, buyAmt);
            } else {
                ns.corporation.buyMaterial(div.name, city, mat, 0);
            }
        }
    }

    // Make products - up to 3, high rating
    if (div.products.length < 3) {
        let prodName = `LazyProd${div.products.length + 1}`;
        const funds = ns.corporation.getCorporation().funds;
        const invest = Math.max(1e9, funds * 0.01);  // at least $1b, up to 1% of funds
        ns.corporation.makeProduct(div.name, productCity, prodName, invest, invest);
    }

    // Sell all products MAX MP, export
    for (let prod of div.products) {
        for (let city of cities) {
            ns.corporation.sellProduct(div.name, city, prod, "MAX", "MP", true);
        }
    }

    // Research
    for (let res of researches) {
        if (!ns.corporation.hasResearched(div.name, res)) {
            let cost = ns.corporation.getResearchCost(div.name, res);
            if (div.research >= cost) {
                ns.corporation.research(div.name, res);

                // Enable TA1/TA2 if applicable
                if (res.includes("Market-TA")) {
                    for (let prod of div.products) {
                        ns.corporation.setProductMarketTA1(div.name, prod, true);
                        ns.corporation.setProductMarketTA2(div.name, prod, true);
                    }
                }
            }
        }
    }
}

function manageGlobal(ns, upgrades) {
    let corp = ns.corporation.getCorporation();
    let funds = corp.funds;

    // Unlocks
    const unlocks = ["Shady Accounting", "Government Partnership"];
    for (let unl of unlocks) {
        if (!ns.corporation.hasUnlock(unl)) {
            let cost = ns.corporation.getUnlockCost(unl);
            if (cost > 0 && cost < funds * 0.1) {
                ns.corporation.purchaseUnlock(unl);
            }
        }
    }

    // Upgrades - buy multiples if affordable
    for (let upg of upgrades) {
        let level = ns.corporation.getUpgradeLevel(upg);
        let cost = ns.corporation.getUpgradeLevelCost(upg, level + 1);

        while (cost > 0 && cost < funds * 0.02) {
            ns.corporation.levelUpgrade(upg, 1);
            funds = ns.corporation.getCorporation().funds;
            level++;
            cost = ns.corporation.getUpgradeLevelCost(upg, level + 1);
        }
    }

    // AdVert if affordable — hireAdVert takes a division name, not corp name
    for (const div of corp.divisions) {
        let advertCost = ns.corporation.getHireAdVertCost(div.name);
        if (advertCost * 4 < funds) {
            ns.corporation.hireAdVert(div.name);
            funds = ns.corporation.getCorporation().funds;
        }
    }

    // Go public if ready (after some products)
    if (!corp.public && corp.divisions[0].products.length >= 2 && corp.numShares < corp.maxShares) {
        // Conservative valuation target
        ns.corporation.goPublic(300000000); // $300m
    }
}
