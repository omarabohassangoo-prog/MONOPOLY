import { Auction, Buy, PendingDebt, Sell } from './actions';
import { BuildAndDemolish, createStandardBoard, Land, SharedLandGroup } from './board';
import { CardDeck } from './cards';
import { Bank, Bonus, Mortgage } from './economy';
import { Loser, Player, PlayerFour, PlayerOne, PlayerThree, PlayerTwo, Winner } from './player';
import { Dice, Jail, WhoseTurn } from './turnAndDice';
import { CardEffectType, GameLogEntry, PendingTradeOffer, PlayerSetupConfig, TurnPhase } from './types';

export class GameAndRoomInfo {
  public gameNumber: string;
  public roomNumber: string;
  public roomName: string;
  public maxPlayers: number;
  public isPrivate: boolean;
  public freeParkingPotEnabled: boolean;

  constructor(
    roomName = 'Mayfair Parlor',
    roomNumber = 'RM-402',
    gameNumber = 'G-01',
    maxPlayers = 4,
    isPrivate = false,
    freeParkingPotEnabled = true
  ) {
    this.roomName = roomName;
    this.roomNumber = roomNumber;
    this.gameNumber = gameNumber;
    this.maxPlayers = Math.min(4, Math.max(2, maxPlayers));
    this.isPrivate = isPrivate;
    this.freeParkingPotEnabled = freeParkingPotEnabled;
  }

  public assignGameNumber(number: string): void {
    this.gameNumber = number.trim() || this.gameNumber;
  }

  public assignRoomNumber(roomId: string): void {
    this.roomNumber = roomId.trim() || this.roomNumber;
  }

  public startNewGameInRoom(newGameNumber: string): void {
    this.assignGameNumber(newGameNumber);
  }

  public getSessionCode(): string {
    const privacyFlag = this.isPrivate ? 'PVT' : 'PUB';
    return `${this.roomNumber} · ${this.gameNumber} · ${privacyFlag}`;
  }
}

export interface DrawnCardBanner {
  deck: 'Chance' | 'Destiny';
  title: string;
  playerName: string;
  playerColor: string;
}

export interface TableNotification {
  text: string;
  tone: 'info' | 'good' | 'warn';
}

export class MonopolyGame {
  public roomAndGameInfo: GameAndRoomInfo;
  public bank: Bank;
  public whoseTurn: WhoseTurn;
  public dice: Dice;
  public jail: Jail;
  public bonus: Bonus;
  public mortgage: Mortgage;
  public buildAndDemolish: BuildAndDemolish;
  public buyAction: Buy;
  public sellAction: Sell;
  public auctionAction: Auction;
  public cardDeck: CardDeck;
  public boardLands: Land[];
  public sharedGroups: SharedLandGroup[];
  public players: Player[];
  public currentDebt: PendingDebt | null;
  public pendingTrade: PendingTradeOffer | null;
  public winner: Winner | null;
  public losers: Loser[];
  public logs: GameLogEntry[];
  public lastDrawnCard: DrawnCardBanner | null;
  public lastNotification: TableNotification | null;
  public lastRollMovedBy: number;

  private pendingJailMoveAfterDebt: number | null = null;
  private logCounter = 1;

  constructor(roomInfo: GameAndRoomInfo, playerConfigs: PlayerSetupConfig[]) {
    this.roomAndGameInfo = roomInfo;
    this.bank = new Bank(20580, 32, 12);
    this.dice = new Dice();
    this.jail = new Jail(10, 50, 3);
    this.bonus = new Bonus(200, 0);
    this.mortgage = new Mortgage(0.5, 0.1);
    this.buildAndDemolish = new BuildAndDemolish();
    this.buyAction = new Buy(this.buildAndDemolish);
    this.sellAction = new Sell(this.buildAndDemolish);
    this.auctionAction = new Auction();
    this.cardDeck = new CardDeck();

    const { lands, groups } = createStandardBoard();
    this.boardLands = lands;
    this.sharedGroups = groups;

    const enabledConfigs = playerConfigs.filter((c) => c.enabled).slice(0, roomInfo.maxPlayers);
    this.players = enabledConfigs.map((cfg) => {
      switch (cfg.playerNumber) {
        case 1:
          return new PlayerOne('p1', cfg.name, cfg.tokenName, 1500, cfg.isBot);
        case 2:
          return new PlayerTwo('p2', cfg.name, cfg.tokenName, 1500, cfg.isBot);
        case 3:
          return new PlayerThree('p3', cfg.name, cfg.tokenName, 1500, cfg.isBot);
        case 4:
          return new PlayerFour('p4', cfg.name, cfg.tokenName, 1500, cfg.isBot);
      }
    });

    if (this.players.length < 2) {
      this.players = [
        new PlayerOne('p1', 'Player 1', 'Top Hat', 1500, false),
        new PlayerTwo('p2', 'Reginald (Bot)', 'Battleship', 1500, true),
      ];
    }

    for (const p of this.players) {
      this.bank.bankMoney.subtract(p.wallet.amount);
    }

    this.whoseTurn = new WhoseTurn(this.players[0]);
    this.currentDebt = null;
    this.pendingTrade = null;
    this.winner = null;
    this.losers = [];
    this.logs = [];
    this.lastDrawnCard = null;
    this.lastNotification = {
      text: `${this.players[0].name} opens the match — roll the dice to begin.`,
      tone: 'info',
    };
    this.lastRollMovedBy = 0;

    this.addLog(
      this.players[0],
      `Table opened for ${this.roomAndGameInfo.roomName} (${this.roomAndGameInfo.getSessionCode()}). ${this.players.length} players seated.`,
      'system'
    );
  }

  public addLog(player: Player, message: string, category: GameLogEntry['category']): void {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.logs.unshift({
      id: `log-${this.logCounter++}`,
      turn: this.whoseTurn?.turnNumber ?? 1,
      playerName: player.name,
      playerColor: player.accentColor,
      message,
      category,
      timestamp: timeStr,
    });
    if (this.logs.length > 100) {
      this.logs.length = 100;
    }
  }

  private notify(text: string, tone: TableNotification['tone'] = 'info'): void {
    this.lastNotification = { text, tone };
  }

  public getCurrentPlayer(): Player {
    return this.whoseTurn.currentPlayer;
  }

  public getCurrentLand(): Land {
    return this.boardLands[this.whoseTurn.currentPlayer.position];
  }

  public getPlayerProperties(player: Player): Land[] {
    return this.boardLands.filter((l) => l.owner?.id === player.id);
  }

  public calculatePlayerNetWorth(player: Player): number {
    let total = player.wallet.amount;
    for (const land of this.getPlayerProperties(player)) {
      total += land.isMortgaged ? land.mortgageValue : land.price.amount;
      total += land.getHousesCount() * Math.round(land.houseCost * 0.5);
      if (land.hasHotel()) {
        total += Math.round(land.houseCost * 2.5);
      }
    }
    return total;
  }

  /**
   * Executes one step of the turn state machine (primarily used for automated bot turns).
   */
  public playStep(): void {
    if (this.checkGameOver()) return;

    if (this.auctionAction.isOpen) {
      const bidder = this.auctionAction.getCurrentBidder();
      if (bidder && bidder.isBot) {
        this.runBotAuctionStep(bidder);
      }
      return;
    }

    const player = this.whoseTurn.currentPlayer;
    if (!player.isBot) return;

    switch (this.whoseTurn.phase) {
      case TurnPhase.ROLL_DICE:
        if (player.inJail) {
          if (player.jailFreeCards.length > 0) {
            this.useJailFreeCard();
          } else if (player.wallet.hasEnough(this.jail.fineAmount) && player.jailTurns >= 1) {
            this.payJailFine();
          } else {
            this.attemptJailEscapeRoll();
          }
        } else {
          this.rollDiceAndMove();
        }
        break;

      case TurnPhase.RESOLVE_LAND:
        this.resolveLanding();
        break;

      case TurnPhase.BUY_OR_AUCTION: {
        const land = this.getCurrentLand();
        const completesMonopoly = this.wouldCompleteGroup(player, land);
        const reserveBuffer = completesMonopoly ? 10 : 45;
        if (
          land.isPurchasable() &&
          land.owner === null &&
          player.wallet.amount >= land.price.amount + reserveBuffer
        ) {
          this.buyCurrentLand();
        } else {
          this.declineAndStartAuction();
        }
        break;
      }

      case TurnPhase.MANAGE_ASSETS:
        this.botManageAssets(player);
        this.endTurn();
        break;

      case TurnPhase.RESOLVE_DEBT:
        this.botResolveDebt(player);
        break;

      case TurnPhase.END_TURN:
        this.endTurn();
        break;
    }
  }

  private wouldCompleteGroup(player: Player, targetLand: Land): boolean {
    if (!targetLand.parentGroup) return false;
    return targetLand.parentGroup.lands.every(
      (l) => l.index === targetLand.index || l.owner?.id === player.id
    );
  }

  public rollDiceAndMove(): { moved: boolean; sentToJail: boolean; fromPos: number; toPos: number } {
    const startPos = this.whoseTurn.currentPlayer.position;
    if (this.whoseTurn.phase !== TurnPhase.ROLL_DICE || this.checkGameOver()) {
      return { moved: false, sentToJail: false, fromPos: startPos, toPos: startPos };
    }

    const player = this.whoseTurn.currentPlayer;
    if (player.inJail) {
      return { moved: false, sentToJail: false, fromPos: startPos, toPos: startPos };
    }

    this.lastDrawnCard = null;
    const rollResult = this.dice.roll();
    this.lastRollMovedBy = rollResult.total;

    const speedingToJail = this.whoseTurn.registerRoll(rollResult.isDouble, 3);
    if (speedingToJail) {
      this.jail.sendToJail(player, this.whoseTurn);
      this.notify(`${player.name} rolled 3 consecutive doubles and was sent to Jail!`, 'warn');
      this.addLog(
        player,
        `Rolled ${rollResult.die1} + ${rollResult.die2} (3rd consecutive double!). Sent straight to Jail.`,
        'jail'
      );
      this.whoseTurn.setPhase(TurnPhase.MANAGE_ASSETS);
      return { moved: false, sentToJail: true, fromPos: startPos, toPos: player.position };
    }

    const passedGo = player.move(rollResult.total, this.boardLands.length);
    if (passedGo) {
      this.bonus.giveGoBonus(player, this.bank);
    }

    const landedTile = this.boardLands[player.position];
    this.notify(
      `${player.name} rolled ${rollResult.total}${rollResult.isDouble ? ' (Doubles!)' : ''} → ${landedTile.name}${passedGo ? ' (+$200 GO)' : ''}`,
      passedGo ? 'good' : 'info'
    );
    this.addLog(
      player,
      `Rolled ${rollResult.die1} + ${rollResult.die2} = ${rollResult.total}${rollResult.isDouble ? ' (Doubles!)' : ''} → landed on ${landedTile.name}${passedGo ? ' (+$200 GO bonus)' : ''}.`,
      'roll'
    );

    this.whoseTurn.setPhase(TurnPhase.RESOLVE_LAND);
    this.resolveLanding();
    return { moved: true, sentToJail: false, fromPos: startPos, toPos: player.position };
  }

  public useJailFreeCard(): boolean {
    const player = this.whoseTurn.currentPlayer;
    if (!player.inJail || this.whoseTurn.phase !== TurnPhase.ROLL_DICE) return false;
    const cardDeckName = player.jailFreeCards.shift();
    if (!cardDeckName) return false;

    this.cardDeck.returnJailFreeCard(cardDeckName);
    player.inJail = false;
    player.jailTurns = 0;
    this.notify(`${player.name} used a Get Out of Jail Free (${cardDeckName}) card!`, 'good');
    this.addLog(player, `Used Get Out of Jail Free (${cardDeckName}) card to exit Jail.`, 'jail');
    return true;
  }

  public payJailFine(): boolean {
    const player = this.whoseTurn.currentPlayer;
    if (!player.inJail || this.whoseTurn.phase !== TurnPhase.ROLL_DICE) return false;

    const ok = this.jail.payFineToRelease(player, this.bank);
    if (!ok) return false;

    this.notify(`${player.name} paid $${this.jail.fineAmount} bail and may roll now.`, 'info');
    this.addLog(player, `Paid $${this.jail.fineAmount} bail to leave Jail.`, 'jail');
    return true;
  }

  public attemptJailEscapeRoll(): boolean {
    const player = this.whoseTurn.currentPlayer;
    if (!player.inJail || this.whoseTurn.phase !== TurnPhase.ROLL_DICE) return false;

    const rollResult = this.dice.roll();
    const escaped = this.jail.tryEscapeByDouble(player, this.dice);

    if (escaped) {
      const passedGo = player.move(rollResult.total, this.boardLands.length);
      if (passedGo) {
        this.bonus.giveGoBonus(player, this.bank);
      }
      this.whoseTurn.resetDoubles();
      const tile = this.boardLands[player.position];
      this.notify(`${player.name} rolled doubles (${rollResult.die1}+${rollResult.die2}) and escaped Jail!`, 'good');
      this.addLog(
        player,
        `Rolled ${rollResult.die1} + ${rollResult.die2} (Doubles!) — Escaped Jail and moved to ${tile.name}.`,
        'jail'
      );
      this.whoseTurn.setPhase(TurnPhase.RESOLVE_LAND);
      this.resolveLanding();
      return true;
    }

    if (player.jailTurns >= this.jail.maxAttempts) {
      this.addLog(
        player,
        `Rolled ${rollResult.die1} + ${rollResult.die2}. 3rd failed Jail attempt — must pay $${this.jail.fineAmount} bail and move ${rollResult.total}.`,
        'jail'
      );
      if (player.pay(this.jail.fineAmount)) {
        this.bank.collect(this.jail.fineAmount);
        player.inJail = false;
        player.jailTurns = 0;
        const passedGo = player.move(rollResult.total, this.boardLands.length);
        if (passedGo) this.bonus.giveGoBonus(player, this.bank);
        const tile = this.boardLands[player.position];
        this.notify(`${player.name} paid mandatory $${this.jail.fineAmount} bail → ${tile.name}`, 'warn');
        this.whoseTurn.setPhase(TurnPhase.RESOLVE_LAND);
        this.resolveLanding();
        return true;
      } else {
        this.pendingJailMoveAfterDebt = rollResult.total;
        this.createDebt(player, null, true, this.jail.fineAmount, 'Mandatory Jail Bail');
        return false;
      }
    }

    this.notify(`${player.name} missed doubles (${rollResult.die1}+${rollResult.die2}) — stays in Jail.`, 'info');
    this.addLog(
      player,
      `Rolled ${rollResult.die1} + ${rollResult.die2} — Stayed in Jail (attempt ${player.jailTurns}/${this.jail.maxAttempts}).`,
      'jail'
    );
    this.whoseTurn.setPhase(TurnPhase.MANAGE_ASSETS);
    return false;
  }

  public resolveLanding(options?: { railroadMultiplier?: number; utilityMultiplier?: number }): void {
    if (this.whoseTurn.phase !== TurnPhase.RESOLVE_LAND) return;
    const player = this.whoseTurn.currentPlayer;
    const tile = this.boardLands[player.position];

    switch (tile.kind) {
      case 'GO':
      case 'JAIL':
        this.whoseTurn.setPhase(TurnPhase.MANAGE_ASSETS);
        break;

      case 'FREE_PARKING': {
        const pot = this.bonus.collectFreeParking(player, this.bank);
        if (pot > 0) {
          this.notify(`${player.name} collected $${pot} from Free Parking!`, 'good');
          this.addLog(player, `Collected $${pot} from the Free Parking pot!`, 'card');
        } else {
          this.addLog(player, `Rested at Free Parking (pot is currently $0).`, 'roll');
        }
        this.whoseTurn.setPhase(TurnPhase.MANAGE_ASSETS);
        break;
      }

      case 'GO_TO_JAIL':
        this.jail.sendToJail(player, this.whoseTurn);
        this.notify(`${player.name} landed on Go To Jail!`, 'warn');
        this.addLog(player, `Landed on Go To Jail! Moved directly to Jail.`, 'jail');
        this.whoseTurn.setPhase(TurnPhase.MANAGE_ASSETS);
        break;

      case 'TAX': {
        const tax = tile.taxAmount;
        if (player.pay(tax)) {
          this.bank.collect(tax);
          if (this.roomAndGameInfo.freeParkingPotEnabled) {
            this.bonus.addToFreeParking(tax);
          }
          this.notify(`${player.name} paid $${tax} for ${tile.name}.`, 'warn');
          this.addLog(
            player,
            `Paid $${tax} for ${tile.name}${this.roomAndGameInfo.freeParkingPotEnabled ? ' (added to Free Parking pot)' : ''}.`,
            'rent'
          );
          this.whoseTurn.setPhase(TurnPhase.MANAGE_ASSETS);
        } else {
          this.createDebt(player, null, true, tax, tile.name);
        }
        break;
      }

      case 'CHANCE': {
        const card = this.cardDeck.drawChance();
        this.lastDrawnCard = {
          deck: 'Chance',
          title: card.title,
          playerName: player.name,
          playerColor: player.accentColor,
        };
        card.applyEffect(player, this);
        break;
      }

      case 'DESTINY': {
        const card = this.cardDeck.drawDestiny();
        this.lastDrawnCard = {
          deck: 'Destiny',
          title: card.title,
          playerName: player.name,
          playerColor: player.accentColor,
        };
        card.applyEffect(player, this);
        break;
      }

      case 'PROPERTY':
      case 'RAILROAD':
      case 'UTILITY': {
        if (tile.owner === null) {
          this.whoseTurn.setPhase(TurnPhase.BUY_OR_AUCTION);
        } else if (tile.owner.id === player.id) {
          this.addLog(player, `Visited own property ${tile.name}.`, 'roll');
          this.whoseTurn.setPhase(TurnPhase.MANAGE_ASSETS);
        } else if (tile.isMortgaged) {
          this.addLog(player, `${tile.name} is mortgaged — no rent due to ${tile.owner.name}.`, 'roll');
          this.whoseTurn.setPhase(TurnPhase.MANAGE_ASSETS);
        } else {
          let rent = tile.getRent(this.dice.total, this.boardLands);
          if (tile.kind === 'RAILROAD' && options?.railroadMultiplier) {
            rent = rent * options.railroadMultiplier;
          }
          if (tile.kind === 'UTILITY' && options?.utilityMultiplier) {
            const freshRoll = this.dice.roll();
            rent = freshRoll.total * options.utilityMultiplier;
            this.addLog(
              player,
              `Rolled ${freshRoll.die1} + ${freshRoll.die2} = ${freshRoll.total} for Utility card (${options.utilityMultiplier}× = $${rent}).`,
              'card'
            );
          }

          if (player.pay(rent)) {
            tile.owner.receive(rent);
            this.notify(`${player.name} paid $${rent} rent to ${tile.owner.name}.`, 'warn');
            this.addLog(player, `Paid $${rent} rent to ${tile.owner.name} for ${tile.name}.`, 'rent');
            this.whoseTurn.setPhase(TurnPhase.MANAGE_ASSETS);
          } else {
            this.createDebt(player, tile.owner, false, rent, `Rent for ${tile.name}`);
          }
        }
        break;
      }
    }
  }

  public resolveCardEffect(
    player: Player,
    title: string,
    effectType: CardEffectType,
    value: number,
    deckName: 'Chance' | 'Destiny'
  ): string {
    this.addLog(player, `Drew ${deckName} Card: "${title}"`, 'card');

    switch (effectType) {
      case 'GET_OUT_OF_JAIL_FREE':
        player.jailFreeCards.push(deckName);
        this.notify(`${player.name} kept a Get Out of Jail Free card!`, 'good');
        this.whoseTurn.setPhase(TurnPhase.MANAGE_ASSETS);
        break;

      case 'COLLECT_BANK':
        this.bank.payOut(value);
        player.receive(value);
        this.notify(`${player.name} collected $${value} (${deckName}).`, 'good');
        this.whoseTurn.setPhase(TurnPhase.MANAGE_ASSETS);
        break;

      case 'PAY_BANK':
        if (player.pay(value)) {
          this.bank.collect(value);
          this.notify(`${player.name} paid $${value} to Bank (${deckName}).`, 'warn');
          this.whoseTurn.setPhase(TurnPhase.MANAGE_ASSETS);
        } else {
          this.createDebt(player, null, true, value, `${deckName}: ${title}`);
        }
        break;

      case 'PAY_FREE_PARKING':
        if (player.pay(value)) {
          this.bank.collect(value);
          if (this.roomAndGameInfo.freeParkingPotEnabled) {
            this.bonus.addToFreeParking(value);
          }
          this.notify(`${player.name} paid $${value} fine (${deckName}).`, 'warn');
          this.whoseTurn.setPhase(TurnPhase.MANAGE_ASSETS);
        } else {
          this.createDebt(player, null, true, value, `${deckName}: ${title}`);
        }
        break;

      case 'GO_TO_JAIL':
        this.jail.sendToJail(player, this.whoseTurn);
        this.notify(`${player.name} was sent to Jail by ${deckName}!`, 'warn');
        this.whoseTurn.setPhase(TurnPhase.MANAGE_ASSETS);
        break;

      case 'ADVANCE_TO_TILE': {
        const currentPos = player.position;
        const target = value;
        const steps = (target - currentPos + this.boardLands.length) % this.boardLands.length;
        const passedGo = steps === 0 ? true : currentPos + steps >= this.boardLands.length;
        player.position = target;
        if (passedGo) {
          this.bonus.giveGoBonus(player, this.bank);
          this.addLog(player, `Passed GO on card move — collected $${this.bonus.goRewardAmount}.`, 'card');
        }
        this.whoseTurn.setPhase(TurnPhase.RESOLVE_LAND);
        this.resolveLanding();
        break;
      }

      case 'MOVE_RELATIVE': {
        player.move(value, this.boardLands.length);
        this.whoseTurn.setPhase(TurnPhase.RESOLVE_LAND);
        this.resolveLanding();
        break;
      }

      case 'NEAREST_RAILROAD': {
        const railroads = [5, 15, 25, 35];
        const nextRail = railroads.find((idx) => idx > player.position) ?? railroads[0];
        if (nextRail < player.position) {
          this.bonus.giveGoBonus(player, this.bank);
          this.addLog(player, `Passed GO heading to Railroad — collected $${this.bonus.goRewardAmount}.`, 'card');
        }
        player.position = nextRail;
        this.whoseTurn.setPhase(TurnPhase.RESOLVE_LAND);
        this.resolveLanding({ railroadMultiplier: 2 });
        break;
      }

      case 'NEAREST_UTILITY': {
        const utilities = [12, 28];
        const nextUtil = utilities.find((idx) => idx > player.position) ?? utilities[0];
        if (nextUtil < player.position) {
          this.bonus.giveGoBonus(player, this.bank);
          this.addLog(player, `Passed GO heading to Utility — collected $${this.bonus.goRewardAmount}.`, 'card');
        }
        player.position = nextUtil;
        this.whoseTurn.setPhase(TurnPhase.RESOLVE_LAND);
        this.resolveLanding({ utilityMultiplier: 10 });
        break;
      }

      case 'REPAIRS': {
        const props = this.getPlayerProperties(player);
        let houseCount = 0;
        let hotelCount = 0;
        for (const p of props) {
          houseCount += p.getHousesCount();
          if (p.hasHotel()) hotelCount += 1;
        }
        const hotelFee = value === 40 ? 115 : value * 4;
        const totalCost = houseCount * value + hotelCount * hotelFee;
        if (totalCost === 0 || player.pay(totalCost)) {
          if (totalCost > 0) this.bank.collect(totalCost);
          this.notify(`${player.name} paid $${totalCost} for property repairs.`, totalCost > 0 ? 'warn' : 'info');
          this.addLog(player, `Paid $${totalCost} in property repairs (${houseCount} houses, ${hotelCount} hotels).`, 'card');
          this.whoseTurn.setPhase(TurnPhase.MANAGE_ASSETS);
        } else {
          this.createDebt(player, null, true, totalCost, 'Property Repairs');
        }
        break;
      }

      case 'COLLECT_FROM_PLAYERS': {
        const others = this.players.filter((p) => !p.isEliminated && p.id !== player.id);
        let collected = 0;
        for (const other of others) {
          const paid = Math.min(value, other.wallet.amount);
          if (paid > 0 && other.pay(paid)) {
            player.receive(paid);
            collected += paid;
          }
        }
        this.notify(`${player.name} collected $${collected} from other players.`, 'good');
        this.addLog(player, `Collected $${collected} total from fellow players.`, 'card');
        this.whoseTurn.setPhase(TurnPhase.MANAGE_ASSETS);
        break;
      }

      case 'PAY_EACH_PLAYER': {
        const others = this.players.filter((p) => !p.isEliminated && p.id !== player.id);
        const total = others.length * value;
        if (player.pay(total)) {
          for (const other of others) {
            other.receive(value);
          }
          this.notify(`${player.name} paid $${value} to each player.`, 'warn');
          this.addLog(player, `Paid $${value} to each of ${others.length} active players ($${total} total).`, 'card');
          this.whoseTurn.setPhase(TurnPhase.MANAGE_ASSETS);
        } else {
          this.createDebt(player, null, false, total, 'Board Chair Payout', others);
        }
        break;
      }
    }

    return title;
  }

  public buyCurrentLand(): boolean {
    if (this.whoseTurn.phase !== TurnPhase.BUY_OR_AUCTION) return false;
    const player = this.whoseTurn.currentPlayer;
    const land = this.getCurrentLand();
    const ok = this.buyAction.buyLand(player, land, this.bank);
    if (!ok) return false;

    const monopolyNow = land.parentGroup?.hasFullMonopoly(player) ?? false;
    this.notify(
      monopolyNow
        ? `${player.name} bought ${land.name} and completed the ${land.groupName} Monopoly!`
        : `${player.name} purchased ${land.name} for $${land.price.amount}.`,
      'good'
    );
    this.addLog(player, `Purchased ${land.name} for $${land.price.amount}.`, 'buy');
    this.whoseTurn.setPhase(TurnPhase.MANAGE_ASSETS);
    return true;
  }

  public declineAndStartAuction(): void {
    if (this.whoseTurn.phase !== TurnPhase.BUY_OR_AUCTION) return;
    const player = this.whoseTurn.currentPlayer;
    const land = this.getCurrentLand();
    const eligible = this.players.filter((p) => !p.isEliminated);
    this.auctionAction.startAuction(land, eligible);
    this.notify(`Auction opened for ${land.name}!`, 'info');
    this.addLog(player, `Declined ${land.name}. Live auction opened!`, 'auction');
  }

  public placeAuctionBid(player: Player, amount: number): boolean {
    if (!this.auctionAction.isOpen) return false;
    const land = this.auctionAction.targetLand;
    const ok = this.auctionAction.bid(player, amount);
    if (!ok) return false;

    this.addLog(player, `Bid $${amount} on ${land?.name ?? 'property'}.`, 'auction');
    if (this.auctionAction.shouldAutoClose()) {
      this.finalizeAuction();
    }
    return true;
  }

  public passAuctionTurn(player: Player): void {
    if (!this.auctionAction.isOpen) return;
    this.auctionAction.pass(player);
    this.addLog(player, `Passed on the auction.`, 'auction');
    if (this.auctionAction.shouldAutoClose()) {
      this.finalizeAuction();
    }
  }

  public finalizeAuction(): void {
    const { winner, amount, land } = this.auctionAction.closeAuction(this.bank);
    if (winner && land && amount > 0) {
      this.notify(`${winner.name} won ${land.name} at auction for $${amount}!`, 'good');
      this.addLog(winner, `Won auction for ${land.name} at $${amount}!`, 'auction');
    } else if (land) {
      this.notify(`Auction for ${land.name} closed with no bids.`, 'info');
      this.addLog(this.whoseTurn.currentPlayer, `Auction for ${land.name} closed with no bids.`, 'auction');
    }
    this.whoseTurn.setPhase(TurnPhase.MANAGE_ASSETS);
  }

  private runBotAuctionStep(bot: Player): void {
    const land = this.auctionAction.targetLand;
    if (!land) {
      this.finalizeAuction();
      return;
    }
    const completesMonopoly = this.wouldCompleteGroup(bot, land);
    const valuationFactor = completesMonopoly ? 1.45 : land.kind === 'RAILROAD' ? 1.25 : 1.05;
    const maxWilling = Math.min(
      bot.wallet.amount - 40,
      Math.round(land.price.amount * valuationFactor)
    );
    const nextBid = this.auctionAction.highestBidder
      ? this.auctionAction.highestBid + 15
      : Math.max(20, Math.round(land.price.amount * 0.45));

    if (nextBid <= maxWilling && bot.wallet.hasEnough(nextBid)) {
      this.placeAuctionBid(bot, nextBid);
    } else {
      this.passAuctionTurn(bot);
    }
  }

  public buildHouseOnLand(land: Land): boolean {
    const player = this.whoseTurn.currentPlayer;
    if (!land.parentGroup) return false;
    const ok = this.buyAction.buyHouse(player, land, land.parentGroup, this.bank);
    if (ok) {
      this.notify(`Built house on ${land.name} (${land.getHousesCount()}/4).`, 'good');
      this.addLog(player, `Built a house on ${land.name} (${land.getHousesCount()}/4) for $${land.houseCost}.`, 'build');
    }
    return ok;
  }

  public buildHotelOnLand(land: Land): boolean {
    const player = this.whoseTurn.currentPlayer;
    if (!land.parentGroup) return false;
    const ok = this.buyAction.buyHotel(player, land, land.parentGroup, this.bank);
    if (ok) {
      this.notify(`Built Hotel on ${land.name}!`, 'good');
      this.addLog(player, `Upgraded ${land.name} to a Hotel for $${land.houseCost}!`, 'build');
    }
    return ok;
  }

  public demolishHouseOnLand(land: Land): boolean {
    const player = this.whoseTurn.currentPlayer;
    if (!land.parentGroup) return false;
    const ok = this.sellAction.sellHouseToBank(player, land, land.parentGroup, this.bank);
    if (ok) {
      this.addLog(player, `Demolished a house on ${land.name} (+$${Math.round(land.houseCost * 0.5)}).`, 'build');
    }
    return ok;
  }

  public demolishHotelOnLand(land: Land): boolean {
    const player = this.whoseTurn.currentPlayer;
    if (!land.parentGroup) return false;
    const ok = this.sellAction.sellHotelToBank(player, land, land.parentGroup, this.bank);
    if (ok) {
      this.addLog(player, `Demolished hotel on ${land.name} (+$${Math.round(land.houseCost * 0.5)}).`, 'build');
    }
    return ok;
  }

  public mortgageProperty(land: Land): boolean {
    const ok = this.mortgage.mortgageLand(land, land.parentGroup, this.bank);
    if (ok && land.owner) {
      this.addLog(land.owner, `Mortgaged ${land.name} for $${land.mortgageValue}.`, 'build');
    }
    return ok;
  }

  public redeemProperty(land: Land): boolean {
    const cost = this.mortgage.getRedeemCost(land);
    const ok = this.mortgage.redeemLand(land, this.bank);
    if (ok && land.owner) {
      this.addLog(land.owner, `Redeemed ${land.name} from mortgage for $${cost}.`, 'build');
    }
    return ok;
  }

  public sellPropertyToPlayer(seller: Player, buyer: Player, land: Land, price: number): boolean {
    const ok = this.sellAction.sellLandToPlayer(seller, buyer, land, price);
    if (ok) {
      this.addLog(seller, `Sold ${land.name} to ${buyer.name} for $${price}.`, 'trade');
    }
    return ok;
  }

  /**
   * Proposes a two-way Monopoly trade (properties + cash + Jail Free cards).
   * If the recipient is a Bot, evaluates & resolves immediately.
   * If the recipient is a Human, stores pendingTrade for interactive confirmation.
   */
  public proposeTrade(offer: PendingTradeOffer): { status: 'accepted' | 'declined' | 'pending'; reason: string } {
    const from = this.players.find((p) => p.id === offer.fromPlayerId && !p.isEliminated);
    const to = this.players.find((p) => p.id === offer.toPlayerId && !p.isEliminated);
    if (!from || !to || from.id === to.id) {
      return { status: 'declined', reason: 'Invalid players selected.' };
    }

    if (offer.offeredCash < 0 || offer.requestedCash < 0) {
      return { status: 'declined', reason: 'Cash amounts must be positive.' };
    }
    if (
      offer.offeredLandIndices.length === 0 &&
      offer.requestedLandIndices.length === 0 &&
      offer.offeredCash === 0 &&
      offer.requestedCash === 0 &&
      offer.offeredJailCards === 0 &&
      offer.requestedJailCards === 0
    ) {
      return { status: 'declined', reason: 'Trade must include at least one deed, card, or cash amount.' };
    }
    const offeredLands = offer.offeredLandIndices.map((idx) => this.boardLands[idx]).filter(Boolean);
    const requestedLands = offer.requestedLandIndices.map((idx) => this.boardLands[idx]).filter(Boolean);

    const fromMortgageFees = requestedLands.reduce(
      (sum, l) => sum + (l.isMortgaged ? Math.round(l.mortgageValue * 0.1) : 0),
      0
    );
    const toMortgageFees = offeredLands.reduce(
      (sum, l) => sum + (l.isMortgaged ? Math.round(l.mortgageValue * 0.1) : 0),
      0
    );

    if (
      !from.wallet.hasEnough(offer.offeredCash + fromMortgageFees) ||
      !to.wallet.hasEnough(offer.requestedCash + toMortgageFees)
    ) {
      return {
        status: 'declined',
        reason: 'One player lacks sufficient cash (including 10% mortgaged deed transfer interest).',
      };
    }
    if (from.jailFreeCards.length < offer.offeredJailCards || to.jailFreeCards.length < offer.requestedJailCards) {
      return { status: 'declined', reason: 'Insufficient Get Out of Jail Free cards.' };
    }

    const invalidOffered = offeredLands.some(
      (l) => l.owner?.id !== from.id || l.getHousesCount() > 0 || l.hasHotel() || (l.parentGroup?.hasAnyBuildings() ?? false)
    );
    const invalidRequested = requestedLands.some(
      (l) => l.owner?.id !== to.id || l.getHousesCount() > 0 || l.hasHotel() || (l.parentGroup?.hasAnyBuildings() ?? false)
    );
    if (invalidOffered || invalidRequested) {
      return { status: 'declined', reason: 'Properties with buildings in their group cannot be traded.' };
    }

    if (to.isBot) {
      const accepted = this.evaluateBotTrade(to, from, offeredLands, offer.offeredCash, offer.offeredJailCards, requestedLands, offer.requestedCash, offer.requestedJailCards);
      if (accepted) {
        this.executeTrade(offer);
        return { status: 'accepted', reason: `${to.name} accepted your trade proposal!` };
      } else {
        this.addLog(from, `Proposed trade to ${to.name} — declined.`, 'trade');
        return { status: 'declined', reason: `${to.name} declined the trade offer (unfavorable value).` };
      }
    }

    this.pendingTrade = offer;
    return { status: 'pending', reason: `Awaiting ${to.name}'s response...` };
  }

  private evaluateBotTrade(
    bot: Player,
    proposer: Player,
    incomingLands: Land[],
    incomingCash: number,
    incomingJailCards: number,
    outgoingLands: Land[],
    outgoingCash: number,
    outgoingJailCards: number
  ): boolean {
    if (!bot.wallet.hasEnough(outgoingCash)) return false;

    let incomingValue = incomingCash + incomingJailCards * 45;
    for (const land of incomingLands) {
      const base = land.isMortgaged ? land.mortgageValue * 0.9 : land.price.amount;
      const bonus = this.wouldCompleteGroup(bot, land) ? land.price.amount * 0.65 : 0;
      incomingValue += base + bonus;
    }

    let outgoingValue = outgoingCash + outgoingJailCards * 45;
    for (const land of outgoingLands) {
      const base = land.isMortgaged ? land.mortgageValue * 0.9 : land.price.amount;
      const monopolyPenalty = this.wouldCompleteGroup(proposer, land) ? land.price.amount * 0.6 : 0;
      outgoingValue += base + monopolyPenalty;
    }

    // Bot accepts if incoming value is at least 95% of outgoing value and bot keeps >= $100 buffer
    return incomingValue >= outgoingValue * 0.95 && bot.wallet.amount - outgoingCash + incomingCash >= 80;
  }

  public acceptPendingTrade(): boolean {
    if (!this.pendingTrade) return false;
    const ok = this.executeTrade(this.pendingTrade);
    this.pendingTrade = null;
    return ok;
  }

  public declinePendingTrade(): void {
    if (!this.pendingTrade) return;
    const from = this.players.find((p) => p.id === this.pendingTrade?.fromPlayerId);
    const to = this.players.find((p) => p.id === this.pendingTrade?.toPlayerId);
    if (from && to) {
      this.addLog(to, `Declined trade offer from ${from.name}.`, 'trade');
    }
    this.pendingTrade = null;
  }

  private executeTrade(offer: PendingTradeOffer): boolean {
    const from = this.players.find((p) => p.id === offer.fromPlayerId);
    const to = this.players.find((p) => p.id === offer.toPlayerId);
    if (!from || !to) return false;

    if (offer.offeredCash > 0) {
      if (!from.pay(offer.offeredCash)) return false;
      to.receive(offer.offeredCash);
    }
    if (offer.requestedCash > 0) {
      if (!to.pay(offer.requestedCash)) return false;
      from.receive(offer.requestedCash);
    }

    for (let i = 0; i < offer.offeredJailCards; i++) {
      const c = from.jailFreeCards.shift();
      if (c) to.jailFreeCards.push(c);
    }
    for (let i = 0; i < offer.requestedJailCards; i++) {
      const c = to.jailFreeCards.shift();
      if (c) from.jailFreeCards.push(c);
    }

    let mortgageTransferFees = 0;
    for (const idx of offer.offeredLandIndices) {
      const land = this.boardLands[idx];
      if (land) {
        land.owner = to;
        if (land.isMortgaged) {
          const fee = Math.round(land.mortgageValue * 0.1);
          if (to.pay(fee)) {
            this.bank.collect(fee);
            mortgageTransferFees += fee;
          }
        }
      }
    }
    for (const idx of offer.requestedLandIndices) {
      const land = this.boardLands[idx];
      if (land) {
        land.owner = from;
        if (land.isMortgaged) {
          const fee = Math.round(land.mortgageValue * 0.1);
          if (from.pay(fee)) {
            this.bank.collect(fee);
            mortgageTransferFees += fee;
          }
        }
      }
    }

    this.notify(`Trade completed between ${from.name} and ${to.name}!`, 'good');
    this.addLog(
      from,
      `Completed trade with ${to.name} (${offer.offeredLandIndices.length} deeds + $${offer.offeredCash} for ${offer.requestedLandIndices.length} deeds + $${offer.requestedCash}${mortgageTransferFees > 0 ? `; $${mortgageTransferFees} mortgage transfer interest` : ''}).`,
      'trade'
    );
    return true;
  }

  private createDebt(
    debtor: Player,
    creditor: Player | null,
    toBank: boolean,
    amountDue: number,
    reason: string,
    splitCreditors: Player[] = []
  ): void {
    this.currentDebt = new PendingDebt(debtor, creditor, toBank, amountDue, reason, splitCreditors);
    this.whoseTurn.setPhase(TurnPhase.RESOLVE_DEBT);
    this.notify(`${debtor.name} owes $${amountDue} (${reason}) — raise funds or declare bankruptcy.`, 'warn');
    this.addLog(
      debtor,
      `Owes $${amountDue} (${reason}) — needs $${Math.max(0, amountDue - debtor.wallet.amount)} more to settle.`,
      'debt'
    );
  }

  public payPendingDebt(): boolean {
    if (!this.currentDebt) return false;
    const { debtor, creditor, splitCreditors, toBank, amountDue, reason } = this.currentDebt;
    if (!debtor.pay(amountDue)) return false;

    if (toBank) {
      this.bank.collect(amountDue);
      if (
        this.roomAndGameInfo.freeParkingPotEnabled &&
        (reason.toLowerCase().includes('tax') || reason.toLowerCase().includes('parking'))
      ) {
        this.bonus.addToFreeParking(amountDue);
      }
    } else if (splitCreditors.length > 0) {
      const share = Math.floor(amountDue / splitCreditors.length);
      for (const peer of splitCreditors) {
        if (!peer.isEliminated) peer.receive(share);
      }
    } else if (creditor) {
      creditor.receive(amountDue);
    }

    this.addLog(debtor, `Settled $${amountDue} debt (${reason}).`, 'debt');
    this.currentDebt = null;

    if (this.pendingJailMoveAfterDebt !== null) {
      const steps = this.pendingJailMoveAfterDebt;
      this.pendingJailMoveAfterDebt = null;
      debtor.inJail = false;
      debtor.jailTurns = 0;
      const passedGo = debtor.move(steps, this.boardLands.length);
      if (passedGo) this.bonus.giveGoBonus(debtor, this.bank);
      this.whoseTurn.setPhase(TurnPhase.RESOLVE_LAND);
      this.resolveLanding();
      return true;
    }

    this.notify(`${debtor.name} settled $${amountDue} debt.`, 'good');
    this.whoseTurn.setPhase(TurnPhase.MANAGE_ASSETS);
    return true;
  }

  public declareBankruptcy(): void {
    const debtor = this.currentDebt?.debtor ?? this.whoseTurn.currentPlayer;
    const creditor = this.currentDebt?.creditor ?? null;
    this.pendingJailMoveAfterDebt = null;

    const ownedLands = this.getPlayerProperties(debtor);
    for (const land of ownedLands) {
      if (land.hasHotel()) {
        land.hotel = null;
        this.bank.returnHotels(1);
        debtor.receive(Math.round(land.houseCost * 2.5));
      }
      if (land.getHousesCount() > 0) {
        const count = land.getHousesCount();
        land.houses = [];
        this.bank.returnHouses(count);
        debtor.receive(count * Math.round(land.houseCost * 0.5));
      }
    }

    const remainingCash = debtor.wallet.amount;
    if (remainingCash > 0) {
      debtor.pay(remainingCash);
      if (creditor && !creditor.isEliminated) {
        creditor.receive(remainingCash);
      } else {
        this.bank.collect(remainingCash);
      }
    }

    // Transfer Jail Free cards
    if (debtor.jailFreeCards.length > 0) {
      if (creditor && !creditor.isEliminated) {
        creditor.jailFreeCards.push(...debtor.jailFreeCards);
      } else {
        for (const deck of debtor.jailFreeCards) {
          this.cardDeck.returnJailFreeCard(deck);
        }
      }
      debtor.jailFreeCards = [];
    }

    for (const land of ownedLands) {
      if (creditor && !creditor.isEliminated) {
        land.owner = creditor;
        if (land.isMortgaged) {
          const interest = Math.round(land.mortgageValue * 0.1);
          if (creditor.pay(interest)) {
            this.bank.collect(interest);
          }
        }
      } else {
        land.owner = null;
        land.isMortgaged = false;
      }
    }

    const loser = new Loser(debtor, this.whoseTurn.turnNumber);
    loser.eliminate(debtor);
    this.losers.push(loser);
    this.currentDebt = null;

    this.notify(`${debtor.name} declared bankruptcy!`, 'warn');
    this.addLog(
      debtor,
      `Declared bankruptcy and was eliminated on turn ${this.whoseTurn.turnNumber}.`,
      'debt'
    );

    if (!this.checkGameOver()) {
      this.whoseTurn.nextTurn(this.players);
    }
  }

  private botManageAssets(bot: Player): void {
    // Attempt strategic Bot-to-Bot trading to complete monopolies
    this.botTryProposeTrade(bot);

    for (const group of this.sharedGroups) {
      if (group.hasFullMonopoly(bot) && !group.hasAnyMortgaged()) {
        for (let pass = 0; pass < 3; pass++) {
          for (const land of group.lands) {
            if (bot.wallet.amount >= land.houseCost + 160) {
              if (land.getHousesCount() === 4 && !land.hasHotel()) {
                this.buildHotelOnLand(land);
              } else if (land.getHousesCount() < 4) {
                this.buildHouseOnLand(land);
              }
            }
          }
        }
      }
    }

    for (const land of this.getPlayerProperties(bot)) {
      if (land.isMortgaged) {
        const cost = this.mortgage.getRedeemCost(land);
        if (bot.wallet.amount >= cost + 200) {
          this.redeemProperty(land);
        }
      }
    }
  }

  private botTryProposeTrade(bot: Player): void {
    if (bot.wallet.amount < 240) return;

    for (const group of this.sharedGroups) {
      if (group.hasFullMonopoly(bot)) continue;
      const missing = group.lands.filter((l) => l.owner?.id !== bot.id);
      const owned = group.lands.filter((l) => l.owner?.id === bot.id);
      if (owned.length === 0 || missing.length !== 1) continue;

      const targetLand = missing[0];
      const partner = targetLand.owner;
      if (!partner || !partner.isBot || partner.isEliminated) continue;
      if (targetLand.parentGroup?.hasAnyBuildings()) continue;

      // Option 1: Swap a deed the partner needs for their own group
      const partnerNeededDeed = this.getPlayerProperties(bot).find(
        (myLand) =>
          myLand.parentGroup &&
          myLand.parentGroup.groupName !== group.groupName &&
          !myLand.parentGroup.hasAnyBuildings() &&
          this.wouldCompleteGroup(partner, myLand)
      );

      if (partnerNeededDeed) {
        const cashDiff = Math.max(0, targetLand.price.amount - partnerNeededDeed.price.amount);
        if (bot.wallet.amount >= cashDiff + 150) {
          const res = this.proposeTrade({
            fromPlayerId: bot.id,
            toPlayerId: partner.id,
            offeredLandIndices: [partnerNeededDeed.index],
            offeredCash: cashDiff,
            offeredJailCards: 0,
            requestedLandIndices: [targetLand.index],
            requestedCash: 0,
            requestedJailCards: 0,
          });
          if (res.status === 'accepted') return;
        }
      }

      // Option 2: Offer generous cash + a spare ungrouped deed to acquire the monopoly piece
      const offerCash = Math.round(targetLand.price.amount * 1.75);
      if (bot.wallet.amount >= offerCash + 180) {
        const res = this.proposeTrade({
          fromPlayerId: bot.id,
          toPlayerId: partner.id,
          offeredLandIndices: [],
          offeredCash: offerCash,
          offeredJailCards: 0,
          requestedLandIndices: [targetLand.index],
          requestedCash: 0,
          requestedJailCards: 0,
        });
        if (res.status === 'accepted') return;
      }
    }
  }

  private botResolveDebt(bot: Player): void {
    if (!this.currentDebt) {
      this.whoseTurn.setPhase(TurnPhase.MANAGE_ASSETS);
      return;
    }

    if (bot.wallet.hasEnough(this.currentDebt.amountDue)) {
      this.payPendingDebt();
      return;
    }

    for (const land of this.getPlayerProperties(bot)) {
      if (land.hasHotel()) {
        if (this.demolishHotelOnLand(land)) return;
      } else if (land.getHousesCount() > 0) {
        if (this.demolishHouseOnLand(land)) return;
      }
    }

    for (const land of this.getPlayerProperties(bot)) {
      if (!land.isMortgaged) {
        if (this.mortgageProperty(land)) return;
      }
    }

    this.declareBankruptcy();
  }

  public endTurn(): void {
    if (this.checkGameOver()) return;
    if (this.whoseTurn.phase === TurnPhase.RESOLVE_DEBT) return;
    if (this.auctionAction.isOpen) return;

    const current = this.whoseTurn.currentPlayer;
    this.lastDrawnCard = null;

    if (this.whoseTurn.isDoubleRoll && !current.inJail && !current.isEliminated) {
      this.whoseTurn.setPhase(TurnPhase.ROLL_DICE);
      this.notify(`${current.name} rolled doubles — takes an extra turn!`, 'good');
      this.addLog(current, `Rolled doubles earlier — takes an extra turn!`, 'roll');
      return;
    }

    const next = this.whoseTurn.nextTurn(this.players);
    this.notify(`Turn ${this.whoseTurn.turnNumber}: ${next.name}'s turn.`, 'info');
    this.addLog(next, `Turn ${this.whoseTurn.turnNumber} begins for ${next.name}.`, 'system');
  }

  public checkGameOver(): boolean {
    if (this.winner) return true;
    const active = this.players.filter((p) => !p.isEliminated);
    if (active.length === 1) {
      const champ = active[0];
      const netWorth = this.calculatePlayerNetWorth(champ);
      this.winner = new Winner(champ, netWorth);
      this.whoseTurn.setPhase(TurnPhase.END_TURN);
      this.notify(this.winner.announceWinner(), 'good');
      this.addLog(champ, this.winner.announceWinner(), 'system');
      return true;
    }
    return false;
  }
}
