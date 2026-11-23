import { BuildAndDemolish, Land, SharedLandGroup } from './board';
import type { Bank } from './economy';
import type { Player } from './player';

export class Buy {
  private builder: BuildAndDemolish;

  constructor(builder?: BuildAndDemolish) {
    this.builder = builder ?? new BuildAndDemolish();
  }

  public buyLand(player: Player, land: Land, bank: Bank): boolean {
    if (!land.isPurchasable() || land.owner !== null) return false;
    const cost = land.price.amount;
    if (!player.pay(cost)) return false;
    bank.collect(cost);
    land.owner = player;
    return true;
  }

  public buyHouse(player: Player, land: Land, group: SharedLandGroup, bank: Bank): boolean {
    if (land.owner?.id !== player.id) return false;
    return this.builder.buildHouse(land, group, bank);
  }

  public buyHotel(player: Player, land: Land, group: SharedLandGroup, bank: Bank): boolean {
    if (land.owner?.id !== player.id) return false;
    return this.builder.buildHotel(land, group, bank);
  }
}

export class Sell {
  private builder: BuildAndDemolish;

  constructor(builder?: BuildAndDemolish) {
    this.builder = builder ?? new BuildAndDemolish();
  }

  public sellLandToPlayer(seller: Player, buyer: Player, land: Land, price: number): boolean {
    if (seller.id === buyer.id || buyer.isEliminated || seller.isEliminated) return false;
    if (land.owner?.id !== seller.id) return false;
    if (land.getHousesCount() > 0 || land.hasHotel()) return false;
    if (land.parentGroup && land.parentGroup.hasAnyBuildings()) return false;
    if (price < 0 || !buyer.wallet.hasEnough(price)) return false;

    if (!buyer.pay(price)) return false;
    seller.receive(price);
    land.owner = buyer;
    return true;
  }

  public sellHouseToBank(player: Player, land: Land, group: SharedLandGroup, bank: Bank): boolean {
    if (land.owner?.id !== player.id) return false;
    return this.builder.demolishHouse(land, group, bank);
  }

  public sellHotelToBank(player: Player, land: Land, group: SharedLandGroup, bank: Bank): boolean {
    if (land.owner?.id !== player.id) return false;
    return this.builder.demolishHotel(land, group, bank);
  }
}

export class PendingDebt {
  public debtor: Player;
  public creditor: Player | null;
  public splitCreditors: Player[];
  public toBank: boolean;
  public amountDue: number;
  public reason: string;

  constructor(
    debtor: Player,
    creditor: Player | null,
    toBank: boolean,
    amountDue: number,
    reason = 'Obligation',
    splitCreditors: Player[] = []
  ) {
    this.debtor = debtor;
    this.creditor = creditor;
    this.toBank = toBank;
    this.amountDue = Math.max(0, Math.round(amountDue));
    this.reason = reason;
    this.splitCreditors = splitCreditors;
  }

  public isResolved(): boolean {
    return this.amountDue <= 0;
  }
}

export class Auction {
  public targetLand: Land | null;
  public highestBid: number;
  public highestBidder: Player | null;
  public activeBidders: Player[];
  public isOpen: boolean;
  public currentBidderIndex: number;

  constructor() {
    this.targetLand = null;
    this.highestBid = 0;
    this.highestBidder = null;
    this.activeBidders = [];
    this.isOpen = false;
    this.currentBidderIndex = 0;
  }

  public startAuction(land: Land, players: Player[]): void {
    this.targetLand = land;
    this.highestBid = 0;
    this.highestBidder = null;
    this.activeBidders = players.filter((p) => !p.isEliminated);
    this.currentBidderIndex = 0;
    this.isOpen = this.activeBidders.length > 0;
  }

  public getCurrentBidder(): Player | null {
    if (!this.isOpen || this.activeBidders.length === 0) return null;
    return this.activeBidders[this.currentBidderIndex % this.activeBidders.length];
  }

  private advancePointer(): void {
    if (this.activeBidders.length === 0) {
      this.currentBidderIndex = 0;
      return;
    }
    this.currentBidderIndex = (this.currentBidderIndex + 1) % this.activeBidders.length;
  }

  public bid(player: Player, amount: number): boolean {
    if (!this.isOpen || !this.targetLand) return false;
    if (!this.activeBidders.some((b) => b.id === player.id)) return false;
    const minValid = this.highestBidder ? this.highestBid + 1 : 1;
    const rounded = Math.round(amount);
    if (rounded < minValid || !player.wallet.hasEnough(rounded)) return false;

    this.highestBid = rounded;
    this.highestBidder = player;
    this.advancePointer();

    // If only 1 bidder remains and they already hold the highest bid, close immediately
    if (this.activeBidders.length === 1 && this.highestBidder?.id === this.activeBidders[0].id) {
      return true;
    }
    return true;
  }

  public pass(player: Player): void {
    if (!this.isOpen) return;
    const idx = this.activeBidders.findIndex((b) => b.id === player.id);
    if (idx === -1) return;

    this.activeBidders.splice(idx, 1);
    if (this.activeBidders.length === 0) {
      this.currentBidderIndex = 0;
      return;
    }

    if (idx < this.currentBidderIndex) {
      this.currentBidderIndex -= 1;
    }
    this.currentBidderIndex = this.currentBidderIndex % this.activeBidders.length;
  }

  public shouldAutoClose(): boolean {
    if (!this.isOpen) return false;
    if (this.activeBidders.length === 0) return true;
    if (this.activeBidders.length === 1 && this.highestBidder?.id === this.activeBidders[0].id) {
      return true;
    }
    return false;
  }

  public closeAuction(bank: Bank): { winner: Player | null; amount: number; land: Land | null } {
    const land = this.targetLand;
    const winner = this.highestBidder;
    const amount = this.highestBid;

    if (land && winner && amount > 0 && winner.pay(amount)) {
      bank.collect(amount);
      land.owner = winner;
    }

    this.isOpen = false;
    this.activeBidders = [];
    this.targetLand = null;
    this.highestBid = 0;
    this.highestBidder = null;
    this.currentBidderIndex = 0;

    return { winner, amount, land };
  }
}
