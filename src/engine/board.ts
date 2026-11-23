import { Bank, Money } from './economy';
import type { Player } from './player';
import type { TileKind } from './types';

export class House {
  public houseId: number;
  public cost: Money;
  public rentBonus: number;
  public isBuilt: boolean;

  constructor(houseId: number, costAmount: number, rentBonus: number, isBuilt = true) {
    this.houseId = houseId;
    this.cost = new Money(costAmount, 'USD');
    this.rentBonus = rentBonus;
    this.isBuilt = isBuilt;
  }
}

export class Hotel {
  public hotelId: number;
  public cost: Money;
  public rentBonus: number;
  public isBuilt: boolean;

  constructor(hotelId: number, costAmount: number, rentBonus: number, isBuilt = true) {
    this.hotelId = hotelId;
    this.cost = new Money(costAmount, 'USD');
    this.rentBonus = rentBonus;
    this.isBuilt = isBuilt;
  }
}

export interface LandConfig {
  index: number;
  name: string;
  kind: TileKind;
  price?: number;
  baseRent?: number;
  rentTiers?: number[]; // [1H, 2H, 3H, 4H, Hotel]
  houseCost?: number;
  groupName?: string;
  groupColor?: string;
  taxAmount?: number;
}

export class Land {
  public index: number;
  public name: string;
  public kind: TileKind;
  public price: Money;
  public owner: Player | null;
  public isMortgaged: boolean;
  public mortgageValue: number;
  public baseRent: number;
  public rentTiers: number[];
  public houseCost: number;
  public groupName: string;
  public groupColor: string;
  public taxAmount: number;
  public houses: House[];
  public hotel: Hotel | null;
  public parentGroup: SharedLandGroup | null = null;

  constructor(config: LandConfig) {
    this.index = config.index;
    this.name = config.name;
    this.kind = config.kind;
    const priceAmount = config.price ?? 0;
    this.price = new Money(priceAmount, 'USD');
    this.owner = null;
    this.isMortgaged = false;
    this.mortgageValue = Math.round(priceAmount * 0.5);
    this.baseRent = config.baseRent ?? 0;
    this.rentTiers = config.rentTiers ?? [];
    this.houseCost = config.houseCost ?? 0;
    this.groupName = config.groupName ?? '';
    this.groupColor = config.groupColor ?? '#CBD5E1';
    this.taxAmount = config.taxAmount ?? 0;
    this.houses = [];
    this.hotel = null;
  }

  public isPurchasable(): boolean {
    return this.kind === 'PROPERTY' || this.kind === 'RAILROAD' || this.kind === 'UTILITY';
  }

  public getHousesCount(): number {
    return this.houses.filter((h) => h.isBuilt).length;
  }

  public hasHotel(): boolean {
    return this.hotel !== null && this.hotel.isBuilt;
  }

  public getRent(diceTotal = 7, allLands: Land[] = []): number {
    if (!this.owner || this.isMortgaged) return 0;

    if (this.kind === 'RAILROAD') {
      const ownedRailroads = allLands.filter(
        (l) => l.kind === 'RAILROAD' && l.owner?.id === this.owner?.id && !l.isMortgaged
      ).length;
      return 25 * Math.pow(2, Math.max(0, ownedRailroads - 1));
    }

    if (this.kind === 'UTILITY') {
      const ownedUtilities = allLands.filter(
        (l) => l.kind === 'UTILITY' && l.owner?.id === this.owner?.id && !l.isMortgaged
      ).length;
      const multiplier = ownedUtilities >= 2 ? 10 : 4;
      return diceTotal * multiplier;
    }

    if (this.kind !== 'PROPERTY') return 0;

    if (this.hasHotel() && this.rentTiers.length >= 5) {
      return this.rentTiers[4];
    }

    const houseCount = this.getHousesCount();
    if (houseCount > 0 && this.rentTiers.length >= houseCount) {
      return this.rentTiers[houseCount - 1];
    }

    if (this.parentGroup && this.parentGroup.hasFullMonopoly(this.owner)) {
      return this.baseRent * 2;
    }

    return this.baseRent;
  }
}

export class SharedLandGroup {
  public groupName: string;
  public color: string;
  public lands: Land[];

  constructor(groupName: string, color: string, lands: Land[] = []) {
    this.groupName = groupName;
    this.color = color;
    this.lands = lands;
    for (const land of lands) {
      land.parentGroup = this;
    }
  }

  public addLand(land: Land): void {
    this.lands.push(land);
    land.parentGroup = this;
  }

  public hasFullMonopoly(player: Player): boolean {
    if (this.lands.length === 0) return false;
    return this.lands.every((land) => land.owner?.id === player.id);
  }

  public hasAnyMortgaged(): boolean {
    return this.lands.some((land) => land.isMortgaged);
  }

  private effectiveLevel(land: Land): number {
    return land.hasHotel() ? 5 : land.getHousesCount();
  }

  public isBalancedToBuild(targetLand: Land): boolean {
    if (!targetLand.owner || targetLand.kind !== 'PROPERTY') return false;
    if (!this.hasFullMonopoly(targetLand.owner) || this.hasAnyMortgaged()) return false;
    const currentLevel = this.effectiveLevel(targetLand);
    if (currentLevel >= 5) return false;
    const minLevel = Math.min(...this.lands.map((l) => this.effectiveLevel(l)));
    return currentLevel === minLevel;
  }

  public isBalancedToDemolish(targetLand: Land): boolean {
    if (targetLand.kind !== 'PROPERTY') return false;
    const currentLevel = this.effectiveLevel(targetLand);
    if (currentLevel <= 0) return false;
    const maxLevel = Math.max(...this.lands.map((l) => this.effectiveLevel(l)));
    return currentLevel === maxLevel;
  }

  public hasAnyBuildings(): boolean {
    return this.lands.some((land) => land.getHousesCount() > 0 || land.hasHotel());
  }
}

let nextBuildingId = 1;

export class BuildAndDemolish {
  public buildHouse(land: Land, group: SharedLandGroup, bank: Bank): boolean {
    if (!land.owner || land.kind !== 'PROPERTY') return false;
    if (land.hasHotel() || land.getHousesCount() >= 4) return false;
    if (!group.isBalancedToBuild(land)) return false;
    if (bank.availableHouses <= 0) return false;
    if (!land.owner.wallet.hasEnough(land.houseCost)) return false;

    if (!bank.takeHouse()) return false;
    land.owner.pay(land.houseCost);
    bank.collect(land.houseCost);

    const nextCount = land.getHousesCount() + 1;
    const rentTier = land.rentTiers[nextCount - 1] ?? land.baseRent * nextCount;
    const prevRent = nextCount === 1 ? land.baseRent * 2 : (land.rentTiers[nextCount - 2] ?? land.baseRent);
    land.houses.push(new House(nextBuildingId++, land.houseCost, rentTier - prevRent, true));
    return true;
  }

  public buildHotel(land: Land, group: SharedLandGroup, bank: Bank): boolean {
    if (!land.owner || land.kind !== 'PROPERTY') return false;
    if (land.hasHotel() || land.getHousesCount() !== 4) return false;
    if (!group.isBalancedToBuild(land)) return false;
    if (bank.availableHotels <= 0) return false;
    if (!land.owner.wallet.hasEnough(land.houseCost)) return false;

    if (!bank.takeHotel()) return false;
    land.owner.pay(land.houseCost);
    bank.collect(land.houseCost);

    const returned = land.houses.length;
    land.houses = [];
    bank.returnHouses(returned);

    const hotelRent = land.rentTiers[4] ?? land.baseRent * 10;
    const fourHouseRent = land.rentTiers[3] ?? land.baseRent * 6;
    land.hotel = new Hotel(nextBuildingId++, land.houseCost, hotelRent - fourHouseRent, true);
    return true;
  }

  public demolishHouse(land: Land, group: SharedLandGroup, bank: Bank): boolean {
    if (!land.owner || land.getHousesCount() === 0 || land.hasHotel()) return false;
    if (!group.isBalancedToDemolish(land)) return false;

    const refund = Math.round(land.houseCost * 0.5);
    land.houses.pop();
    bank.returnHouses(1);
    bank.payOut(refund);
    land.owner.receive(refund);
    return true;
  }

  public demolishHotel(land: Land, group: SharedLandGroup, bank: Bank): boolean {
    if (!land.owner || !land.hasHotel()) return false;
    if (!group.isBalancedToDemolish(land)) return false;

    const halfHouse = Math.round(land.houseCost * 0.5);
    const housesReturned = Math.min(4, bank.availableHouses);
    for (let i = 0; i < housesReturned; i++) {
      bank.takeHouse();
      land.houses.push(new House(nextBuildingId++, land.houseCost, 0, true));
    }
    const levelsSold = 5 - housesReturned;
    const refund = halfHouse * levelsSold;
    land.hotel = null;
    bank.returnHotels(1);
    bank.payOut(refund);
    land.owner.receive(refund);
    return true;
  }
}

export function createStandardBoard(): { lands: Land[]; groups: SharedLandGroup[] } {
  const configs: LandConfig[] = [
    { index: 0, name: 'GO', kind: 'GO' },
    {
      index: 1,
      name: 'Mediterranean Ave',
      kind: 'PROPERTY',
      price: 60,
      baseRent: 2,
      rentTiers: [10, 30, 90, 160, 250],
      houseCost: 50,
      groupName: 'Brown',
      groupColor: '#7C4A2D',
    },
    { index: 2, name: 'Destiny Chest', kind: 'DESTINY' },
    {
      index: 3,
      name: 'Baltic Ave',
      kind: 'PROPERTY',
      price: 60,
      baseRent: 4,
      rentTiers: [20, 60, 180, 320, 450],
      houseCost: 50,
      groupName: 'Brown',
      groupColor: '#7C4A2D',
    },
    { index: 4, name: 'Income Tax', kind: 'TAX', taxAmount: 200 },
    { index: 5, name: 'Reading Railroad', kind: 'RAILROAD', price: 200, baseRent: 25, groupName: 'Railroad', groupColor: '#334155' },
    {
      index: 6,
      name: 'Oriental Ave',
      kind: 'PROPERTY',
      price: 100,
      baseRent: 6,
      rentTiers: [30, 90, 270, 400, 550],
      houseCost: 50,
      groupName: 'Light Blue',
      groupColor: '#38BDF8',
    },
    { index: 7, name: 'Chance', kind: 'CHANCE' },
    {
      index: 8,
      name: 'Vermont Ave',
      kind: 'PROPERTY',
      price: 100,
      baseRent: 6,
      rentTiers: [30, 90, 270, 400, 550],
      houseCost: 50,
      groupName: 'Light Blue',
      groupColor: '#38BDF8',
    },
    {
      index: 9,
      name: 'Connecticut Ave',
      kind: 'PROPERTY',
      price: 120,
      baseRent: 8,
      rentTiers: [40, 100, 300, 450, 600],
      houseCost: 50,
      groupName: 'Light Blue',
      groupColor: '#38BDF8',
    },
    { index: 10, name: 'Jail / Visiting', kind: 'JAIL' },
    {
      index: 11,
      name: 'St. Charles Place',
      kind: 'PROPERTY',
      price: 140,
      baseRent: 10,
      rentTiers: [50, 150, 450, 625, 750],
      houseCost: 100,
      groupName: 'Pink',
      groupColor: '#D9468F',
    },
    { index: 12, name: 'Electric Company', kind: 'UTILITY', price: 150, baseRent: 28, groupName: 'Utility', groupColor: '#64748B' },
    {
      index: 13,
      name: 'States Ave',
      kind: 'PROPERTY',
      price: 140,
      baseRent: 10,
      rentTiers: [50, 150, 450, 625, 750],
      houseCost: 100,
      groupName: 'Pink',
      groupColor: '#D9468F',
    },
    {
      index: 14,
      name: 'Virginia Ave',
      kind: 'PROPERTY',
      price: 160,
      baseRent: 12,
      rentTiers: [60, 180, 500, 700, 900],
      houseCost: 100,
      groupName: 'Pink',
      groupColor: '#D9468F',
    },
    { index: 15, name: 'Pennsylvania RR', kind: 'RAILROAD', price: 200, baseRent: 25, groupName: 'Railroad', groupColor: '#334155' },
    {
      index: 16,
      name: 'St. James Place',
      kind: 'PROPERTY',
      price: 180,
      baseRent: 14,
      rentTiers: [70, 200, 550, 750, 950],
      houseCost: 100,
      groupName: 'Orange',
      groupColor: '#EA7317',
    },
    { index: 17, name: 'Destiny Chest', kind: 'DESTINY' },
    {
      index: 18,
      name: 'Tennessee Ave',
      kind: 'PROPERTY',
      price: 180,
      baseRent: 14,
      rentTiers: [70, 200, 550, 750, 950],
      houseCost: 100,
      groupName: 'Orange',
      groupColor: '#EA7317',
    },
    {
      index: 19,
      name: 'New York Ave',
      kind: 'PROPERTY',
      price: 200,
      baseRent: 16,
      rentTiers: [80, 220, 600, 800, 1000],
      houseCost: 100,
      groupName: 'Orange',
      groupColor: '#EA7317',
    },
    { index: 20, name: 'Free Parking', kind: 'FREE_PARKING' },
    {
      index: 21,
      name: 'Kentucky Ave',
      kind: 'PROPERTY',
      price: 220,
      baseRent: 18,
      rentTiers: [90, 250, 700, 875, 1050],
      houseCost: 150,
      groupName: 'Red',
      groupColor: '#C83E37',
    },
    { index: 22, name: 'Chance', kind: 'CHANCE' },
    {
      index: 23,
      name: 'Indiana Ave',
      kind: 'PROPERTY',
      price: 220,
      baseRent: 18,
      rentTiers: [90, 250, 700, 875, 1050],
      houseCost: 150,
      groupName: 'Red',
      groupColor: '#C83E37',
    },
    {
      index: 24,
      name: 'Illinois Ave',
      kind: 'PROPERTY',
      price: 240,
      baseRent: 20,
      rentTiers: [100, 300, 750, 925, 1100],
      houseCost: 150,
      groupName: 'Red',
      groupColor: '#C83E37',
    },
    { index: 25, name: 'B. & O. Railroad', kind: 'RAILROAD', price: 200, baseRent: 25, groupName: 'Railroad', groupColor: '#334155' },
    {
      index: 26,
      name: 'Atlantic Ave',
      kind: 'PROPERTY',
      price: 260,
      baseRent: 22,
      rentTiers: [110, 330, 800, 975, 1150],
      houseCost: 150,
      groupName: 'Yellow',
      groupColor: '#D4A017',
    },
    {
      index: 27,
      name: 'Ventnor Ave',
      kind: 'PROPERTY',
      price: 260,
      baseRent: 22,
      rentTiers: [110, 330, 800, 975, 1150],
      houseCost: 150,
      groupName: 'Yellow',
      groupColor: '#D4A017',
    },
    { index: 28, name: 'Water Works', kind: 'UTILITY', price: 150, baseRent: 28, groupName: 'Utility', groupColor: '#64748B' },
    {
      index: 29,
      name: 'Marvin Gardens',
      kind: 'PROPERTY',
      price: 280,
      baseRent: 24,
      rentTiers: [120, 360, 850, 1025, 1200],
      houseCost: 150,
      groupName: 'Yellow',
      groupColor: '#D4A017',
    },
    { index: 30, name: 'Go To Jail', kind: 'GO_TO_JAIL' },
    {
      index: 31,
      name: 'Pacific Ave',
      kind: 'PROPERTY',
      price: 300,
      baseRent: 26,
      rentTiers: [130, 390, 900, 1100, 1275],
      houseCost: 200,
      groupName: 'Green',
      groupColor: '#1E824C',
    },
    {
      index: 32,
      name: 'North Carolina Ave',
      kind: 'PROPERTY',
      price: 300,
      baseRent: 26,
      rentTiers: [130, 390, 900, 1100, 1275],
      houseCost: 200,
      groupName: 'Green',
      groupColor: '#1E824C',
    },
    { index: 33, name: 'Destiny Chest', kind: 'DESTINY' },
    {
      index: 34,
      name: 'Pennsylvania Ave',
      kind: 'PROPERTY',
      price: 320,
      baseRent: 28,
      rentTiers: [150, 450, 1000, 1200, 1400],
      houseCost: 200,
      groupName: 'Green',
      groupColor: '#1E824C',
    },
    { index: 35, name: 'Short Line', kind: 'RAILROAD', price: 200, baseRent: 25, groupName: 'Railroad', groupColor: '#334155' },
    { index: 36, name: 'Chance', kind: 'CHANCE' },
    {
      index: 37,
      name: 'Park Place',
      kind: 'PROPERTY',
      price: 350,
      baseRent: 35,
      rentTiers: [175, 500, 1100, 1300, 1500],
      houseCost: 200,
      groupName: 'Dark Blue',
      groupColor: '#1E3A8A',
    },
    { index: 38, name: 'Luxury Tax', kind: 'TAX', taxAmount: 100 },
    {
      index: 39,
      name: 'Boardwalk',
      kind: 'PROPERTY',
      price: 400,
      baseRent: 50,
      rentTiers: [200, 600, 1400, 1700, 2000],
      houseCost: 200,
      groupName: 'Dark Blue',
      groupColor: '#1E3A8A',
    },
  ];

  const lands = configs.map((cfg) => new Land(cfg));
  const groupMap = new Map<string, SharedLandGroup>();

  for (const land of lands) {
    if (land.kind === 'PROPERTY' && land.groupName) {
      let group = groupMap.get(land.groupName);
      if (!group) {
        group = new SharedLandGroup(land.groupName, land.groupColor, []);
        groupMap.set(land.groupName, group);
      }
      group.addLand(land);
    }
  }

  return { lands, groups: Array.from(groupMap.values()) };
}
