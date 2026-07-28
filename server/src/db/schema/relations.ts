import { relations } from 'drizzle-orm';
import { friendRequests } from './friendRequests.js';
import { friendships } from './friendships.js';
import { playerStats } from './playerStats.js';
import {
  matchParticipants,
  matches,
  seasonPlayerStats,
  seasonRewards,
  seasons,
  userSeasonRewardClaims,
} from './progression.js';
import { users } from './users.js';
import { weaponLoadouts } from './weaponLoadouts.js';
import { userWeaponUpgrades, weapons } from './weapons.js';

export const usersRelations = relations(users, ({ one, many }) => ({
  stats: one(playerStats, {
    fields: [users.id],
    references: [playerStats.userId],
  }),
  friendships: many(friendships, { relationName: 'userFriendships' }),
  friendsOf: many(friendships, { relationName: 'friendOf' }),
  sentFriendRequests: many(friendRequests, { relationName: 'sentRequests' }),
  receivedFriendRequests: many(friendRequests, { relationName: 'receivedRequests' }),
  weaponLoadouts: many(weaponLoadouts),
  weaponUpgrades: many(userWeaponUpgrades),
  seasonStats: many(seasonPlayerStats),
  matchResults: many(matchParticipants),
  seasonRewardClaims: many(userSeasonRewardClaims),
}));

export const playerStatsRelations = relations(playerStats, ({ one }) => ({
  user: one(users, {
    fields: [playerStats.userId],
    references: [users.id],
  }),
}));

export const seasonsRelations = relations(seasons, ({ many }) => ({
  playerStats: many(seasonPlayerStats),
  matches: many(matches),
  rewards: many(seasonRewards),
  claims: many(userSeasonRewardClaims),
}));

export const seasonPlayerStatsRelations = relations(seasonPlayerStats, ({ one }) => ({
  user: one(users, {
    fields: [seasonPlayerStats.userId],
    references: [users.id],
  }),
  season: one(seasons, {
    fields: [seasonPlayerStats.seasonId],
    references: [seasons.id],
  }),
}));

export const matchesRelations = relations(matches, ({ one, many }) => ({
  season: one(seasons, {
    fields: [matches.seasonId],
    references: [seasons.id],
  }),
  participants: many(matchParticipants),
}));

export const matchParticipantsRelations = relations(matchParticipants, ({ one }) => ({
  match: one(matches, {
    fields: [matchParticipants.matchId],
    references: [matches.id],
  }),
  user: one(users, {
    fields: [matchParticipants.userId],
    references: [users.id],
  }),
}));

export const seasonRewardsRelations = relations(seasonRewards, ({ one }) => ({
  season: one(seasons, {
    fields: [seasonRewards.seasonId],
    references: [seasons.id],
  }),
}));

export const userSeasonRewardClaimsRelations = relations(userSeasonRewardClaims, ({ one }) => ({
  user: one(users, {
    fields: [userSeasonRewardClaims.userId],
    references: [users.id],
  }),
  season: one(seasons, {
    fields: [userSeasonRewardClaims.seasonId],
    references: [seasons.id],
  }),
}));

export const friendshipsRelations = relations(friendships, ({ one }) => ({
  user: one(users, {
    fields: [friendships.userId],
    references: [users.id],
    relationName: 'userFriendships',
  }),
  friend: one(users, {
    fields: [friendships.friendId],
    references: [users.id],
    relationName: 'friendOf',
  }),
}));

export const friendRequestsRelations = relations(friendRequests, ({ one }) => ({
  fromUser: one(users, {
    fields: [friendRequests.fromUserId],
    references: [users.id],
    relationName: 'sentRequests',
  }),
  toUser: one(users, {
    fields: [friendRequests.toUserId],
    references: [users.id],
    relationName: 'receivedRequests',
  }),
}));

export const weaponsRelations = relations(weapons, ({ many }) => ({
  primaryLoadouts: many(weaponLoadouts, { relationName: 'primaryWeapon' }),
  secondaryLoadouts: many(weaponLoadouts, { relationName: 'secondaryWeapon' }),
  userUpgrades: many(userWeaponUpgrades),
}));

export const userWeaponUpgradesRelations = relations(userWeaponUpgrades, ({ one }) => ({
  user: one(users, {
    fields: [userWeaponUpgrades.userId],
    references: [users.id],
  }),
  weapon: one(weapons, {
    fields: [userWeaponUpgrades.weaponId],
    references: [weapons.id],
  }),
}));

export const weaponLoadoutsRelations = relations(weaponLoadouts, ({ one }) => ({
  user: one(users, {
    fields: [weaponLoadouts.userId],
    references: [users.id],
  }),
  primaryWeapon: one(weapons, {
    fields: [weaponLoadouts.primaryWeaponId],
    references: [weapons.id],
    relationName: 'primaryWeapon',
  }),
  secondaryWeapon: one(weapons, {
    fields: [weaponLoadouts.secondaryWeaponId],
    references: [weapons.id],
    relationName: 'secondaryWeapon',
  }),
}));
