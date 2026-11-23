import type { Land, SharedLandGroup } from './board';
import type { Player } from './player';

export class Money {
  public amount: number;
  public currency: string;

  constructor(amount = 0, currency = 'USD') {
    this.amount = Math.max(0, Math.round(amount));
    this.currency = currency;
  }

  public add(value: number): void {
    if (value <= 0) return;
    this.amount += Math.round(value);
  }

  public subtract(value: number): boolean {
    const rounded = Math.round(value);
    if (!this.hasEnough(rounded)) {
      return false;
    }
    this.amount -= rounded;
    return true;
  }

  public hasEnough(value: number): boolean {
    return this.amount >= Math.round(value);
  }
}

export class Bank {
  public bankMoney: Money;
  public availableHouses: number;
  public availableHotels: number;

  constructor(initialMoney = 20580, availableHouses = 32, availableHotels = 12) {
    this.bankMoney = new Money(initialMoney, 'USD');
    this.availableHouses = availableHouses;
    this.availableHotels = availableHotels;
  }

  public payOut(amount: number): boolean {
    if (amount <= 0) return true;
    // Standard Monopoly rule: bank never goes broke; replenish reserve if needed
    if (!this.bankMoney.hasEnough(amount)) {
      this.bankMoney.add(amount + 10000);
    }
    return this.bankMoney.subtract(amount);
  }

  public collect(amount: number): void {
    if (amount <= 0) return;
    this.bankMoney.add(amount);
  }

  public takeHouse(): boolean {
    if (this.availableHouses <= 0) return false;
    this.availableHouses -= 1;
    return true;
  }

  public returnHouses(count: number): void {
    this.availableHouses = Math.min(32, this.availableHouses + Math.max(0, count));
  }

  public takeHotel(): boolean {
    if (this.availableHotels <= 0) return false;
    this.availableHotels -= 1;
    return true;
  }

  public returnHotels(count: number): void {
    this.availableHotels = Math.min(12, this.availableHotels + Math.max(0, count));
  }
}

export class Bonus {
  public goRewardAmount: number;
  public freeParkingAmount: number;

  constructor(goRewardAmount = 200, freeParkingAmount = 0) {
    this.goRewardAmount = goRewardAmount;
    this.freeParkingAmount = freeParkingAmount;
  }

  public giveGoBonus(player: Player, bank: Bank): void {
    if (bank.payOut(this.goRewardAmount)) {
      player.receive(this.goRewardAmount);
    }
  }

  public addToFreeParking(amount: number): void {
    if (amount > 0) {
      this.freeParkingAmount += Math.round(amount);
    }
  }

  public collectFreeParking(player: Player, bank: Bank): number {
    const pot = this.freeParkingAmount;
    if (pot > 0) {
      bank.payOut(pot);
      player.receive(pot);
      this.freeParkingAmount = 0;
    }
    return pot;
  }
}

export class Mortgage {
  public mortgageRate: number;
  public interestRate: number;

  constructor(mortgageRate = 0.5, interestRate = 0.1) {
    this.mortgageRate = mortgageRate;
    this.interestRate = interestRate;
  }

  public getRedeemCost(land: Land): number {
    return Math.round(land.mortgageValue * (1 + this.interestRate));
  }

  public mortgageLand(land: Land, group: SharedLandGroup | null, bank: Bank): boolean {
    if (!land.owner || land.isMortgaged || land.mortgageValue <= 0) {
      return false;
    }
    if (land.getHousesCount() > 0 || land.hasHotel()) {
      return false;
    }
    if (group && group.hasAnyBuildings()) {
      return false;
    }
    land.isMortgaged = true;
    bank.payOut(land.mortgageValue);
    land.owner.receive(land.mortgageValue);
    return true;
  }

  public redeemLand(land: Land, bank: Bank): boolean {
    if (!land.owner || !land.isMortgaged) {
      return false;
    }
    const cost = this.getRedeemCost(land);
    if (!land.owner.pay(cost)) {
      return false;
    }
    bank.collect(cost);
    land.isMortgaged = false;
    return true;
  }
}
