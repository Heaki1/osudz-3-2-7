import type { AuthUser } from '../NavHeader';
import type { ApiDuel } from '../../../api/client';

export interface DuelCardProps { duel: ApiDuel; onSelect: () => void; onAccept: () => void; onNavigateToPlayer: (username: string) => void; balance: number; }
export interface DuelDetailsProps { duel: ApiDuel; balance: number; userId?: number; onAccept: () => void; onClose: () => void; }
export interface LiveDuelProps { duel: ApiDuel; user: AuthUser | null; onSelect: () => void; onImport: () => void; onNavigateToPlayer: (username: string) => void; onReplayShared?: () => Promise<void>; }
export interface ReplayViewerProps { duel: ApiDuel; watching: boolean; }
export interface ReplayShareScreenProps { label: string; player: string; ready: boolean; }
export interface PlayerScoreProps { name: string; avatarUrl?: string; score?: number; accuracy?: number; misses?: number; maxCombo?: number; leading: boolean; losing: boolean; mine: boolean; align: 'left' | 'right'; onImport: () => void; onNavigateToPlayer: (username: string) => void; }
export interface RulesModalProps { purpose: 'post' | 'accept'; onAccept: () => void; onClose: () => void; }
export interface CreateDuelProps { balance: number; onClose: () => void; onCreated: () => Promise<void>; }
export interface MineProps { duels: ApiDuel[]; userId?: number; onImport: (id: number) => void; onRefresh: () => Promise<void>; }
export interface MyDuelRowProps { duel: ApiDuel; selected: boolean; onSelect: () => void; }
export interface MyDuelDetailProps { duel: ApiDuel; userId?: number; onImport: () => void; onRefresh: () => Promise<void>; }
export interface CurrentDuelsSectionProps { duels: ApiDuel[]; selectedId: number | null; user: AuthUser | null; onSelect: (id: number | null) => void; onImport: (id: number) => void; onNavigateToPlayer: (username: string) => void; onReplayShared: () => Promise<void>; }
export interface LiveSectionProps { duels: ApiDuel[]; user: AuthUser | null; onSelect: (id: number) => void; onImport: () => void; onPost: () => void; }
