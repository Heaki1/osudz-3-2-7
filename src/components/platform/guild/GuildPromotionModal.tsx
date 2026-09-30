import React from 'react';
import { Eye, LockKeyhole, Shield, Sparkles, Sword } from 'lucide-react';

export type GuildPromotionNotification = {
  id: number;
  title: string;
  body: string;
  payload: Record<string, unknown>;
};

type PromotionRank = 'COPPER' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'MITHRIL' | 'ORICHALCUM' | 'ADAMANTITE';

const PROMOTIONS: Record<PromotionRank, { from: string; label: string; visual: string; message: string; icon: 'eye' | 'shield' | 'seal' | 'lock' | 'butler' | 'sword' | 'aura' }> = {
  COPPER: {
    from: 'IRON', label: 'Copper', visual: 'Cold stare · copper plate dropping on wood', icon: 'eye',
    message: 'You survived, mosquito? How surprising. I suppose you are slightly more useful than a common slug now. Here is your Copper tag. Try not to die on the next contract; the paperwork is tedious.',
  },
  SILVER: {
    from: 'COPPER', label: 'Silver', visual: 'Silver shield clashing on a counter', icon: 'shield',
    message: "Silver, eh? You’ve finally washed the stench of a rookie off you. You hunted a rival target and proved your steel. Welcome to the ranks of the true professionals. Don't let the Guild down.",
  },
  GOLD: {
    from: 'SILVER', label: 'Gold', visual: 'Golden seal stamped in the dark', icon: 'seal',
    message: 'Oya? It seems the little sheep has learned how to bite. To consistently execute your contracts without a single misstep... fascinating. I look forward to seeing how much further your potential can be... harvested.',
  },
  PLATINUM: {
    from: 'GOLD', label: 'Platinum', visual: 'Black feathers · steel-blue chamber · vault door lock', icon: 'lock',
    message: 'To think a lowly human could reach the Elite ranks. You have claimed victory and survived the deep waters. I suppose you are somewhat competent. Just remember your place—no matter how high you climb, you remain an insect before the Supreme One.',
  },
  MITHRIL: {
    from: 'PLATINUM', label: 'Mithril', visual: 'Serene butler · pale blue glow · magical chime', icon: 'butler',
    message: 'You possess a strong will and a steady blade. Surviving those ironclad contracts requires both absolute discipline and honor. You have earned this Mithril badge. Please, continue to walk a path you can be proud of.',
  },
  ORICHALCUM: {
    from: 'MITHRIL', label: 'Orichalcum', visual: 'Massive black broadsword shattering the screen · blazing fire', icon: 'sword',
    message: 'You have dismantled the Elites and conquered the most dangerous bounties in this realm. Few ever reach this domain. As a fellow warrior, I respect your strength. Carry this Orichalcum rank with the weight it deserves.',
  },
  ADAMANTITE: {
    from: 'ORICHALCUM', label: 'Adamantite', visual: 'Pitch black · heartbeat · purple/green aura explosion · crowd roar', icon: 'aura',
    message: 'Umu. You have defended your throne against all challengers and proven yourself the absolute apex of this world. Excellent! I acknowledge your supreme power! Rise, Adamantite Adventurer! Let your name echo through the annals of history!',
  },
};

function SceneIcon({ icon }: { icon: (typeof PROMOTIONS)[PromotionRank]['icon'] }) {
  if (icon === 'eye') return <Eye className="guild-promotion-scene__icon" />;
  if (icon === 'shield') return <Shield className="guild-promotion-scene__icon" />;
  if (icon === 'lock') return <LockKeyhole className="guild-promotion-scene__icon" />;
  if (icon === 'sword') return <Sword className="guild-promotion-scene__icon guild-promotion-scene__sword" />;
  return icon === 'aura' ? <Sparkles className="guild-promotion-scene__icon guild-promotion-scene__aura-icon" /> : <div className="guild-promotion-scene__seal">G</div>;
}

export function GuildPromotionModal({ notification, onClose }: { notification: GuildPromotionNotification; onClose: () => void }) {
  const rank = typeof notification.payload.newRank === 'string' ? notification.payload.newRank as PromotionRank : null;
  const promotion = rank ? PROMOTIONS[rank] : null;
  if (!rank || !promotion) return null;

  return (
    <div className={'guild-promotion-overlay guild-promotion-overlay--' + rank} role="dialog" aria-modal="true" aria-labelledby="guild-promotion-title">
      <div className="guild-promotion-backdrop" aria-hidden="true" />
      <div className="guild-promotion-modal">
        <div className="guild-promotion-scene" aria-hidden="true">
          <div className="guild-promotion-scene__particles" />
          <div className="guild-promotion-scene__line" />
          <SceneIcon icon={promotion.icon} />
          <img src={'/guild/badges/' + rank.toLowerCase() + '.png'} alt="" className="guild-promotion-scene__badge" />
          <div className="guild-promotion-scene__caption">{promotion.visual}</div>
        </div>
        <div className="guild-promotion-copy">
          <div className="guild-promotion-copy__eyebrow">GUILD RANK ADJUSTED · {promotion.from} → {promotion.label.toUpperCase()}</div>
          <h2 id="guild-promotion-title">Your rank has risen.</h2>
          <div className="guild-promotion-copy__rule" />
          <blockquote>{promotion.message}</blockquote>
          <div className="guild-promotion-copy__rank"><img src={'/guild/badges/' + rank.toLowerCase() + '.png'} alt={promotion.label + ' Guild badge'} /><span>{promotion.label} Adventurer</span></div>
          <button className="guild-seal-button guild-promotion-copy__button" onClick={() => void onClose()}>Accept the Rank</button>
        </div>
      </div>
    </div>
  );
}
