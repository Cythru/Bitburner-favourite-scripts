/** @param {NS} ns 
 * LazyCorp.js - Autocorp for Bitburner (v1.1 - fixed cost msg + bug fixes)
 * By a lazy dev who grinded anyway.
 * Starts corp, expands, hires, produces, upgrades. Runs forever.
 * Run on home: run LazyCorp.js
 * Profits? Yeah, eventually. Need $150b to start.
**/

export async function main(ns) {
    ns.disableLog('ALL');

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
        ns.corporation.expandIndustry(corp.name, "Tobacco");
        corp = ns.corporation.getCorporation();
    }

    // Expand to Pharma if not
    if (corp.divisions.length === 1) {
        ns.corporation.expandIndustry(corp.name, "Pharmaceutical");
    }

    while (true) {
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
        while (office.employees.length < office.maxSize) {
            if (!ns.corporation.hireEmployee(div.name, city)) break;
        }

        // Set jobs: simple split - ops/eng heavy for prod, rest R&D/mgmt
        let numEmp = office.employees.length;
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

    // Warehouses - upgrade when almost full
    for (let city of cities) {
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
        let wh = ns.corporation.getWarehouse(div.name, city);
        let funds = ns.corporation.getCorporation().funds;

        for (let mat of matNames) {
            let info = ns.corporation.getMaterial(div.name, city, mat);
            let stock = info.qty;
            let spaceLeft = wh.size - wh.sizeUsed;

            // Buy at most 10% of remaining space or 100 million units (safe cap)
            let buyAmt = Math.min(Math.floor(spaceLeft * 0.1), 100e6);
            let estCost = buyAmt * info.marketPrice * 1.1; // rough +10% buffer

            if (stock < wh.size * 0.5 && buyAmt > 0 && estCost < funds * 0.05) {
                ns.corporation.buyMaterial(div.name, city, mat, buyAmt);
            }
        }
    }

    // Make products - up to 3, high rating
    if (div.products.length < 3) {
        let prodName = `LazyProd${div.products.length + 1}`;
        ns.corporation.makeProduct(div.name, productCity, prodName, "MAX", 10);
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

    // AdVert if affordable
    let advertCost = ns.corporation.getHireAdVertCost(corp.name);
    if (advertCost * 4 < funds) {
        ns.corporation.hireAdVert(corp.name);
    }

    // Go public if ready (after some products)
    if (!corp.public && corp.divisions[0].products.length >= 2 && corp.numShares < corp.maxShares) {
        // Conservative valuation target
        ns.corporation.goPublic(300000000); // $300m
    }
}
