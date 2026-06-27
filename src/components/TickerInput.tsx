import React, { useState, useEffect, useRef } from 'react';

interface TickerSuggestion {
  symbol: string;
  name: string;
  source: 'popular' | 'portfolio';
}

const POPULAR_TICKERS: { symbol: string; name: string }[] = [
  { symbol: 'CSSPX.MI', name: 'is_etf_sp500' },
  { symbol: 'VWCE.MI', name: 'is_etf_allworld' },
  { symbol: 'SWDA.MI', name: 'is_etf_msciworld' },
  { symbol: 'VAGF.MI', name: 'is_etf_globalbond' },
  { symbol: 'EIMI.MI', name: 'is_etf_msciem' },
  { symbol: 'AGGH.MI', name: 'is_etf_globalbond_hedged' },
  { symbol: 'LCWD.MI', name: 'is_etf_lyxorworld' },
  { symbol: 'SGLD.MI', name: 'is_etc_gold' },
  { symbol: 'BTC-EUR', name: 'crypto_bitcoin_eur' },
  { symbol: 'ETH-EUR', name: 'crypto_ethereum_eur' },
  { symbol: 'BTCUSD', name: 'crypto_bitcoin_usd' },
  { symbol: 'ETHUSD', name: 'crypto_ethereum_usd' },
  { symbol: 'IUSN.MI', name: 'is_etf_world_smallcap' },
  { symbol: 'MEUD.MI', name: 'is_etf_stoxx600' }
];

const METADATA: { [symbol: string]: string } = {
  'CSSPX.MI': 'iShares Core S&P 500 UCITS ETF (Acc)',
  'VWCE.MI': 'Vanguard FTSE All-World UCITS ETF (Acc)',
  'SWDA.MI': 'iShares Core MSCI World UCITS ETF (Acc)',
  'VAGF.MI': 'Vanguard Global Aggregate Bond UCITS ETF (Acc)',
  'EIMI.MI': 'iShares Core MSCI EM IMI UCITS ETF (Acc)',
  'AGGH.MI': 'iShares Core Global Aggregate Bond EUR Hedged (Acc)',
  'LCWD.MI': 'Lyxor Core MSCI World UCITS ETF (Acc)',
  'SGLD.MI': 'Invesco Physical Gold ETC',
  'BTC-EUR': 'Bitcoin / EUR Rate',
  'ETH-EUR': 'Ethereum / EUR Rate',
  'BTCUSD': 'Bitcoin / USD Rate',
  'ETHUSD': 'Ethereum / USD Rate',
  'IUSN.MI': 'iShares MSCI World Small Cap UCITS ETF (Acc)',
  'MEUD.MI': 'Lyxor Core STOXX Europe 600 UCITS ETF (Acc)'
};

interface TickerInputProps {
  id?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  portfolioSymbols?: string[];
  onSelect?: (val: string) => void;
}

export const TickerInput: React.FC<TickerInputProps> = ({
  id,
  value,
  onChange,
  placeholder = 'es. CSSPX.MI',
  className = '',
  portfolioSymbols = [],
  onSelect
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<TickerSuggestion[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicked outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter suggestions
  useEffect(() => {
    const query = value.trim().toLowerCase();
    if (!query) {
      setSuggestions([]);
      return;
    }

    const matched: TickerSuggestion[] = [];

    // 1. Add portfolio matching symbols
    portfolioSymbols.forEach(sym => {
      const uSym = sym.toUpperCase();
      if (uSym.toLowerCase().includes(query) && uSym.toLowerCase() !== query) {
        matched.push({
          symbol: uSym,
          name: 'In portafoglio',
          source: 'portfolio'
        });
      }
    });

    // 2. Add popular matching symbols
    POPULAR_TICKERS.forEach(item => {
      const symBase = item.symbol.replace('.MI', '').toLowerCase();
      const isMatch = item.symbol.toLowerCase().includes(query) || symBase.includes(query);
      const alreadyInList = matched.some(m => m.symbol.toUpperCase() === item.symbol.toUpperCase());
      
      if (isMatch && !alreadyInList && item.symbol.toUpperCase() !== query.toUpperCase()) {
        matched.push({
          symbol: item.symbol,
          name: METADATA[item.symbol] || item.name,
          source: 'popular'
        });
      }
    });

    setSuggestions(matched.slice(0, 6)); // Limit to max 6 suggestions
  }, [value, portfolioSymbols]);

  const handleSelect = (symbol: string) => {
    onChange(symbol);
    if (onSelect) {
      onSelect(symbol);
    }
    setIsOpen(false);
  };

  return (
    <div className="relative w-full" ref={dropdownRef} id={id}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className={className}
      />
      
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-[999] left-0 right-0 mt-1.5 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
          <div className="p-1.5 bg-slate-900 border-b border-slate-800 text-[9px] uppercase tracking-wider text-slate-500 font-bold font-mono">
            Sfoglia Suggerimenti Ticker
          </div>
          <div className="divide-y divide-slate-900/60">
            {suggestions.map((s) => (
              <button
                key={s.symbol}
                type="button"
                onClick={() => handleSelect(s.symbol)}
                className="w-full text-left px-3 py-2 hover:bg-slate-900 flex flex-col transition duration-150"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-emerald-400 font-mono tracking-wide">{s.symbol}</span>
                  <span className={`text-[8.5px] px-1.5 py-0.5 rounded font-bold font-mono ${s.source === 'portfolio' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-slate-800 text-slate-400'}`}>
                    {s.source === 'portfolio' ? 'Portafoglio' : 'Popol.'}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 truncate mt-0.5 font-medium leading-tight">
                  {s.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
