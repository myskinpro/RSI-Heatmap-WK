import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Download, FileText, Calendar, User, Hash, RefreshCw, DollarSign } from 'lucide-react';
import axios from 'axios';

export function IrpfForm() {
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [loading, setLoading] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number>(5.0); // Default placeholder
  
  const [reportData, setReportData] = useState([
    { month: 'Janeiro', profit: 0, tax: 0, usdtProfit: 0 },
    { month: 'Fevereiro', profit: 0, tax: 0, usdtProfit: 0 },
    { month: 'Março', profit: 0, tax: 0, usdtProfit: 0 },
    { month: 'Abril', profit: 0, tax: 0, usdtProfit: 0 },
    { month: 'Maio', profit: 0, tax: 0, usdtProfit: 0 },
    { month: 'Junho', profit: 0, tax: 0, usdtProfit: 0 },
    { month: 'Julho', profit: 0, tax: 0, usdtProfit: 0 },
    { month: 'Agosto', profit: 0, tax: 0, usdtProfit: 0 },
    { month: 'Setembro', profit: 0, tax: 0, usdtProfit: 0 },
    { month: 'Outubro', profit: 0, tax: 0, usdtProfit: 0 },
    { month: 'Novembro', profit: 0, tax: 0, usdtProfit: 0 },
    { month: 'Dezembro', profit: 0, tax: 0, usdtProfit: 0 },
  ]);

  useEffect(() => {
    axios.get('https://economia.awesomeapi.com.br/last/USD-BRL')
      .then(response => {
        if (response.data?.USDBRL?.ask) {
          setExchangeRate(parseFloat(response.data.USDBRL.ask));
        }
      })
      .catch(err => console.error('Failed to fetch exchange rate:', err));
  }, []);

  const totalProfit = reportData.reduce((acc, curr) => acc + curr.profit, 0);
  const totalTax = reportData.reduce((acc, curr) => acc + curr.tax, 0);

  const fetchApiData = async () => {
    setLoading(true);
    try {
      const customApiKey = localStorage.getItem('BINANCE_API_KEY') || '';
      const customApiSecret = localStorage.getItem('BINANCE_API_SECRET') || '';

      const signatureFn = async (qs: string) => {
        if (customApiKey && customApiSecret) {
          const enc = new TextEncoder();
          const key = await crypto.subtle.importKey(
            'raw',
            enc.encode(customApiSecret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
          );
          const signature = await crypto.subtle.sign('HMAC', key, enc.encode(qs));
          return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
        } else {
          const res = await axios.get('/api/binance-auth', { params: { qs } });
          return res.data.signature;
        }
      };

      let mainApiKey = customApiKey;
      if (!mainApiKey) {
        const apiKeyRes = await axios.get('/api/binance-auth', { params: { qs: 'test=1' } });
        mainApiKey = apiKeyRes.data.apiKey;
      }

      const selectedYear = parseInt(year);
      const startObj = new Date(selectedYear, 0, 1);
      startObj.setHours(0, 0, 0, 0);
      const startTime = startObj.getTime();
      
      const endObj = new Date(selectedYear, 11, 31);
      endObj.setHours(23, 59, 59, 999);
      const endTime = endObj.getTime();

      let allIncome: any[] = [];
      let seenIncomeIds = new Set();
      let currentStartTime = startTime;
      const maxWaitFrames = 200; // Allow enough requests to cover the whole year if needed

      for (let i = 0; i < maxWaitFrames; i++) {
        const timestamp = Date.now();
        let chunkEndTime = Math.min(currentStartTime + 29 * 24 * 60 * 60 * 1000, endTime);
        const qs = `startTime=${currentStartTime}&endTime=${chunkEndTime}&limit=1000&timestamp=${timestamp}`;
        
        const signature = await signatureFn(qs);
        const response = await axios.get(`https://fapi.binance.com/fapi/v1/income?${qs}&signature=${signature}`, {
          headers: { 'X-MBX-APIKEY': mainApiKey }
        });
        
        const pageData = response.data;
        if (!Array.isArray(pageData) || pageData.length === 0) {
          if (chunkEndTime >= endTime) break;
          currentStartTime = chunkEndTime + 1;
          continue;
        }
        
        for (const t of pageData) {
          if (!seenIncomeIds.has(t.tranId)) {
            seenIncomeIds.add(t.tranId);
            allIncome.push(t);
          }
        }
        
        if (pageData.length < 1000) {
          if (chunkEndTime >= endTime) break;
          currentStartTime = chunkEndTime + 1;
        } else {
          currentStartTime = pageData[pageData.length - 1].time;
        }
      }

      // Group by month
      const monthlyData = Array(12).fill(0).map(() => ({ usdtProfit: 0 }));

      allIncome.forEach((item: any) => {
        const date = new Date(item.time);
        if (date.getFullYear() === selectedYear) {
          const month = date.getMonth();
          const val = parseFloat(item.income);
          if (['COMMISSION', 'FUNDING_FEE', 'REALIZED_PNL'].includes(item.incomeType)) {
            monthlyData[month].usdtProfit += val;
          }
        }
      });

      const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ];

      const newReportData = monthlyData.map((data, index) => {
        const profitBrl = data.usdtProfit * exchangeRate;
        // Na nova regra de exchange no exterior não há isenção. Lucro > 0 é tributado em 15%
        const tax = profitBrl > 0 ? profitBrl * 0.15 : 0;
        
        return {
          month: monthNames[index],
          usdtProfit: data.usdtProfit,
          profit: profitBrl,
          tax: tax
        };
      });

      setReportData(newReportData);

    } catch (err) {
      console.error("Failed to fetch API data", err);
      alert("Houve um erro ao buscar os dados da API. Verifique suas chaves.");
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    
    // Título
    doc.setFontSize(18);
    doc.setTextColor(40, 40, 40);
    doc.text(`Relatório Criptoativos para IRPF - Ano Base ${year}`, 14, 22);
    
    // Dados do Contribuinte
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text(`Nome do Contribuinte: ${name || 'Não informado'}`, 14, 32);
    doc.text(`CPF: ${cpf || 'Não informado'}`, 14, 38);
    doc.text(`Data de Geração: ${new Date().toLocaleDateString('pt-BR')}`, 14, 44);
    doc.text(`Câmbio Utilizado (USD/BRL): ${exchangeRate.toFixed(4)}`, 14, 50);

    // Tabela
    const tableColumn = ["Mês", "PnL (USDT)", "Resultado Líquido (R$)", "Imposto Devido (15%)"];
    const tableRows = reportData.map(data => [
      data.month,
      data.usdtProfit.toFixed(4),
      data.profit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      data.tax.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 60,
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    // Resumo Final
    const finalY = (doc as any).lastAutoTable.finalY || 60;
    
    doc.setFontSize(12);
    doc.setTextColor(40, 40, 40);
    doc.text(`Resumo Anual`, 14, finalY + 15);
    
    const totalUsdt = reportData.reduce((acc, curr) => acc + curr.usdtProfit, 0);

    doc.setFontSize(10);
    doc.text(`Lucro/Prejuízo Total (USDT): ${totalUsdt.toFixed(4)}`, 14, finalY + 23);
    doc.text(`Lucro/Prejuízo Total (R$): ${totalProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, 14, finalY + 29);
    doc.text(`Total de Imposto Devido (15%): ${totalTax.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, 14, finalY + 35);

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    const disclaimer = "Aviso: A partir de 2024, de acordo com a Lei 14.754/2023, operacoes em exchanges no exterior nao possuem isencao de 35k. Relatorio apenas auxiliar.";
    doc.text(disclaimer, 14, finalY + 50, { maxWidth: 180 });

    doc.save(`IRPF_${year}_Cripto_${cpf || 'relatorio'}.pdf`);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-main flex items-center gap-2">
          <FileText className="text-accent" />
          Relatório Auxiliar IRPF
        </h1>
        <p className="text-text-dim mt-2 tracking-wide">
          Gere um relatório consolidado com os resultados mensais de suas operações para facilitar o preenchimento da declaração de Imposto de Renda (Ganhos de Capital - Criptoativos).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-surface rounded-xl border border-border p-5">
          <label className="text-sm tracking-wider uppercase text-text-dim font-bold mb-3 flex items-center gap-2">
            <User size={16} /> Contribuinte
          </label>
          <input 
            type="text" 
            placeholder="Nome Completo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-surface-light border border-border rounded-lg px-4 py-2 text-text-main focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        <div className="bg-surface rounded-xl border border-border p-5">
          <label className="text-sm tracking-wider uppercase text-text-dim font-bold mb-3 flex items-center gap-2">
            <Hash size={16} /> CPF
          </label>
          <input 
            type="text" 
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            className="w-full bg-surface-light border border-border rounded-lg px-4 py-2 text-text-main focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        <div className="bg-surface rounded-xl border border-border p-5">
          <label className="text-sm tracking-wider uppercase text-text-dim font-bold mb-3 flex items-center gap-2">
            <Calendar size={16} /> Ano Base
          </label>
          <select 
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-full bg-surface-light border border-border rounded-lg px-4 py-2 text-text-main focus:outline-none focus:border-accent transition-colors"
          >
            <option value="2025">2025 (Declarado em 2026)</option>
            <option value="2024">2024 (Declarado em 2025)</option>
            <option value="2023">2023 (Declarado em 2024)</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <button 
            onClick={fetchApiData}
            disabled={loading}
            className="flex items-center justify-center gap-2 bg-surface hover:bg-surface-light border border-border text-white px-6 py-3 rounded-lg font-bold transition-all disabled:opacity-50 flex-1 md:flex-none"
          >
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
            <span>{loading ? 'Buscando Dados...' : '1. Buscar Dados da API'}</span>
          </button>
          
          <div className="flex items-center gap-2 bg-surface rounded-lg border border-border px-4 py-3 text-sm text-text-dim">
            <DollarSign size={16} className="text-accent" />
            <span>Câmbio USD/BRL:</span>
            <input 
              type="number" 
              step="0.01"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(parseFloat(e.target.value))}
              className="w-20 bg-transparent text-white focus:outline-none border-b border-border focus:border-accent ml-1"
            />
          </div>
        </div>

        <button 
          onClick={generatePDF}
          className="flex items-center justify-center gap-2 bg-accent hover:bg-accent/80 text-white px-6 py-3 rounded-lg font-bold transition-all shadow-[0_0_15px_rgba(41,128,185,0.4)] hover:shadow-[0_0_25px_rgba(41,128,185,0.6)] w-full md:w-auto"
        >
          <Download size={20} />
          <span>2. Gerar Relatório PDF</span>
        </button>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden mb-8">
        <div className="p-4 border-b border-border bg-surface-light flex items-center justify-between">
          <h2 className="font-bold tracking-wider text-sm uppercase">Resumo Consolidado {year}</h2>
          <span className="text-xs text-text-dim bg-[#EF4444]/10 text-[#EF4444] px-2 py-1 rounded border border-[#EF4444]/20 font-bold">Sem isenção (Exchange Estrangeira)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-light text-text-dim">
              <tr>
                <th className="py-3 px-4 font-semibold uppercase tracking-wider text-xs">Mês</th>
                <th className="py-3 px-4 font-semibold uppercase tracking-wider text-xs text-right">PnL (USDT)</th>
                <th className="py-3 px-4 font-semibold uppercase tracking-wider text-xs text-right">Resultado Líquido (R$)</th>
                <th className="py-3 px-4 font-semibold uppercase tracking-wider text-xs text-right">Imposto Devido (15%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono">
              {reportData.map((data, idx) => (
                <tr key={idx} className="hover:bg-surface-light/50 transition-colors">
                  <td className="py-3 px-4 font-sans">{data.month}</td>
                  <td className={`py-3 px-4 text-right ${data.usdtProfit > 0 ? 'text-[#10B981]' : data.usdtProfit < 0 ? 'text-[#EF4444]' : 'text-text-main'}`}>
                    {data.usdtProfit !== 0 ? data.usdtProfit.toFixed(4) : '-'}
                  </td>
                  <td className={`py-3 px-4 text-right ${data.profit > 0 ? 'text-[#10B981]' : data.profit < 0 ? 'text-[#EF4444]' : 'text-text-main'}`}>
                    {data.profit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className={`py-3 px-4 text-right ${data.tax > 0 ? 'text-[#EF4444] font-bold' : 'text-text-dim'}`}>
                    {data.tax > 0 ? data.tax.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface-light font-bold text-text-main border-t-2 border-border">
              <tr>
                <td className="py-4 px-4 font-sans uppercase text-xs tracking-wider">Totais do Ano</td>
                <td className={`py-4 px-4 text-right bg-surface-light text-text-dim`}></td>
                <td className={`py-4 px-4 text-right ${totalProfit > 0 ? 'text-[#10B981]' : totalProfit < 0 ? 'text-[#EF4444]' : ''}`}>
                  {totalProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td className="py-4 px-4 text-right text-[#EF4444] font-bold">
                  {totalTax.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Note/Disclaimer component */}
      <div className="mt-12 p-4 border border-border/50 bg-[#EF4444]/5 rounded-lg text-xs leading-relaxed text-text-dim">
        <strong className="text-white block mb-1">Aviso Importante sobre Exchanges no Exterior:</strong>
        A partir de 2024, de acordo com a Lei 14.754/2023 (nova regra para aplicações financeiras no exterior), operações de criptoativos realizadas em exchanges estrangeiras (como a Binance) <strong>não possuem mais a isenção de R$ 35.000,00 mensais</strong>. Todo o lucro passa a ser tributado à alíquota de 15%. Este relatório é gerado apenas de forma auxiliar. Recomenda-se sempre a conferência dos dados por um contador certificado antes de enviar os dados à Receita Federal. O aplicativo não se responsabiliza por eventuais multas ou informações incorretas enviadas aos órgãos fiscais.
      </div>
    </div>
  );
}
