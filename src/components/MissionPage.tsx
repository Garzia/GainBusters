/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { LanguagePhrases } from '../types.ts';
import { Activity, Shield, Coins, TrendingUp } from 'lucide-react';

interface MissionPageProps {
  t: LanguagePhrases;
}

export default function MissionPage({ t }: MissionPageProps) {
  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      {/* Brand Hero */}
      <div className="text-center space-y-4 p-8 bg-slate-900/50 rounded-2xl border border-slate-800 backdrop-blur">
        <div className="flex justify-center">
          <img
            src="/src/assets/images/gainbusters_logo_1779817742514.png"
            alt="GainBusters Logo"
            className="w-32 h-32 rounded-2xl shadow-lg border-2 border-green-500/30 object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-white font-sans">
          {t.appName}
        </h1>
        <p className="text-lg text-slate-400 font-mono italic">
          {t.appSlogan}
        </p>
      </div>

      {/* Philosophical core content */}
      <div className="bg-slate-900/40 p-8 rounded-2xl border border-slate-800/80 space-y-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
          <Shield className="text-green-500 w-6 h-6" />
          {t.mission}
        </h2>
        
        <div className="prose prose-invert prose-slate max-w-none text-slate-300 space-y-6 leading-relaxed">
          <p>
            {t.missionIntro}
          </p>

          <h3 className="text-lg font-semibold text-white mt-6">{t.missionPilarsTitle}</h3>
          
          <div className="grid md:grid-cols-2 gap-6 mt-4">
            <div className="p-5 bg-slate-950/60 rounded-xl border border-slate-800/60 space-y-2 hover:border-green-500/20 transition-all">
              <div className="flex items-center gap-2 text-green-400 font-bold mb-1">
                <Coins className="w-5 h-5 text-green-500" />
                <span>{t.missionPilar1Title}</span>
              </div>
              <p className="text-sm text-slate-400">
                {t.missionPilar1Desc}
              </p>
            </div>

            <div className="p-5 bg-slate-950/60 rounded-xl border border-slate-800/60 space-y-2 hover:border-green-500/20 transition-all">
              <div className="flex items-center gap-2 text-green-400 font-bold mb-1">
                <TrendingUp className="w-5 h-5 text-green-500" />
                <span>{t.missionPilar2Title}</span>
              </div>
              <p className="text-sm text-slate-400">
                {t.missionPilar2Desc}
              </p>
            </div>

            <div className="p-5 bg-slate-950/60 rounded-xl border border-slate-800/60 space-y-2 hover:border-green-500/20 transition-all">
              <div className="flex items-center gap-2 text-green-400 font-bold mb-1">
                <Activity className="w-5 h-5 text-green-500" />
                <span>{t.missionPilar3Title}</span>
              </div>
              <p className="text-sm text-slate-400">
                {t.missionPilar3Desc}
              </p>
            </div>

            <div className="p-5 bg-slate-950/60 rounded-xl border border-slate-800/60 space-y-2 hover:border-green-500/20 transition-all">
              <div className="flex items-center gap-2 text-green-400 font-bold mb-1">
                <Shield className="w-5 h-5 text-green-500" />
                <span>{t.missionPilar4Title}</span>
              </div>
              <p className="text-sm text-slate-400">
                {t.missionPilar4Desc}
              </p>
            </div>
          </div>

          <div className="bg-green-950/20 border border-green-500/20 p-5 rounded-xl space-y-2 mt-6">
            <h4 className="font-semibold text-green-400">{t.missionVincitriceTitle}</h4>
            <p className="text-sm text-slate-300">
              {t.missionVincitriceDesc}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
