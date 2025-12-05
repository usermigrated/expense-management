import React, { useState, useEffect, useMemo } from 'react'
import { Bar, Line, Pie } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { jsPDF } from 'jspdf'
import * as XLSX from 'xlsx'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend
)

const STORAGE_KEY_EXPENSES = 'det_expenses_tw_dashboard_v1'
const STORAGE_KEY_CURRENCY = 'det_currency_tw_dashboard_v1'
const STORAGE_KEY_BUDGET = 'det_budget_tw_dashboard_v1'
const STORAGE_KEY_THEME = 'det_theme_tw_dashboard_v1'

const CATEGORIES = ['Food', 'Travel', 'Shopping', 'Rent', 'Bills', 'Entertainment', 'Other']

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function monthKey(dateStr) {
  return dateStr.slice(0, 7)
}

function yearKey(dateStr) {
  return dateStr.slice(0, 4)
}

function sumAmounts(list) {
  return list.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
}

function safeParseJSON(value, fallback) {
  if (!value) return fallback
  try {
    const parsed = JSON.parse(value)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

export default function App() {
  // ---- STATE with lazy localStorage hydration ----
  const [expenses, setExpenses] = useState(() => {
    if (typeof window === 'undefined') return []
    const raw = window.localStorage.getItem(STORAGE_KEY_EXPENSES)
    const parsed = safeParseJSON(raw, [])
    return Array.isArray(parsed) ? parsed : []
  })

  const [currency, setCurrency] = useState(() => {
    if (typeof window === 'undefined') return '£'
    return window.localStorage.getItem(STORAGE_KEY_CURRENCY) || '£'
  })

  const [monthlyBudget, setMonthlyBudget] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem(STORAGE_KEY_BUDGET) || ''
  })

  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'system'
    const stored = window.localStorage.getItem(STORAGE_KEY_THEME)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
    return 'system'
  })

  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [category, setCategory] = useState(CATEGORIES[0])
  const [note, setNote] = useState('')
  const [filterMonth, setFilterMonth] = useState(monthKey(todayISO()))
  const [showBudgetAlert, setShowBudgetAlert] = useState(false)

  // THEME EFFECT
  useEffect(() => {
    const root = window.document.documentElement
    const prefersDark =
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches

    const effectiveDark = theme === 'dark' || (theme === 'system' && prefersDark)
    if (effectiveDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    window.localStorage.setItem(STORAGE_KEY_THEME, theme)
  }, [theme])

  // PERSIST CHANGES
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(expenses))
  }, [expenses])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY_CURRENCY, currency)
  }, [currency])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY_BUDGET, monthlyBudget)
  }, [monthlyBudget])

  // DERIVED
  const filteredByMonth = useMemo(
    () => expenses.filter((e) => monthKey(e.date) === filterMonth),
    [expenses, filterMonth]
  )

  const totalToday = useMemo(
    () => sumAmounts(expenses.filter((e) => e.date === todayISO())),
    [expenses]
  )

  const totalThisMonth = useMemo(
    () => sumAmounts(filteredByMonth),
    [filteredByMonth]
  )

  const totalAllTime = useMemo(
    () => sumAmounts(expenses),
    [expenses]
  )

  const totalByCategoryForMonth = useMemo(() => {
    const map = {}
    for (const cat of CATEGORIES) map[cat] = 0
    for (const e of filteredByMonth) {
      map[e.category] = (map[e.category] || 0) + Number(e.amount || 0)
    }
    return map
  }, [filteredByMonth])

  // BUDGET ALERT
  useEffect(() => {
    const limit = Number(monthlyBudget)
    if (limit > 0 && totalThisMonth > limit) {
      setShowBudgetAlert(true)
      try {
        if (window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate(180)
        }
      } catch {
        // ignore vibration errors
      }
    } else {
      setShowBudgetAlert(false)
    }
  }, [monthlyBudget, totalThisMonth])

  // ACTIONS
  const handleAddExpense = () => {
    if (!amount || Number(amount) <= 0) return
    if (!date) return

    const newExpense = {
      id: Date.now(),
      amount: Number(amount),
      date,
      category,
      note: note.trim(),
    }

    setExpenses((prev) => [...prev, newExpense])
    setAmount('')
    setNote('')
    setDate(todayISO())
    setCategory(CATEGORIES[0])
  }

  const handleDeleteExpense = (id) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id))
  }

  const fmt = (value) => {
    const num = Number(value) || 0
    return currency + ' ' + num.toFixed(2)
  }

const [navOpen, setNavOpen] = useState(false);


  // CHART DATA
  const dailyChartData = useMemo(() => {
    if (filteredByMonth.length === 0) {
      return { labels: [], datasets: [] }
    }
    const dayMap = {}
    for (const e of filteredByMonth) {
      dayMap[e.date] = (dayMap[e.date] || 0) + Number(e.amount || 0)
    }
    const labels = Object.keys(dayMap).sort()
    return {
      labels,
      datasets: [
        {
          label: 'Daily Spend',
          data: labels.map((d) => dayMap[d]),
          tension: 0.3,
          borderWidth: 2,
        },
      ],
    }
  }, [filteredByMonth])

  const monthlyChartData = useMemo(() => {
    if (expenses.length === 0) return { labels: [], datasets: [] }
    const map = {}
    for (const e of expenses) {
      const key = monthKey(e.date)
      map[key] = (map[key] || 0) + Number(e.amount || 0)
    }
    const labels = Object.keys(map).sort()
    return {
      labels,
      datasets: [
        {
          label: 'Monthly Spend',
          data: labels.map((m) => map[m]),
        },
      ],
    }
  }, [expenses])

  const yearlyChartData = useMemo(() => {
    if (expenses.length === 0) return { labels: [], datasets: [] }
    const map = {}
    for (const e of expenses) {
      const key = yearKey(e.date)
      map[key] = (map[key] || 0) + Number(e.amount || 0)
    }
    const labels = Object.keys(map).sort()
    return {
      labels,
      datasets: [
        {
          label: 'Yearly Spend',
          data: labels.map((y) => map[y]),
        },
      ],
    }
  }, [expenses])

  const categoryPieData = useMemo(() => {
    const labels = []
    const data = []
    for (const cat of CATEGORIES) {
      const total = totalByCategoryForMonth[cat] || 0
      if (total > 0) {
        labels.push(cat)
        data.push(total)
      }
    }
    return {
      labels,
      datasets: [
        {
          label: 'By Category',
          data,
        },
      ],
    }
  }, [totalByCategoryForMonth])

  // EXPORTS
  const exportCSV = () => {
    if (expenses.length === 0) return
    const header = ['Date', 'Category', 'Note', 'Amount']
    const rows = expenses.map((e) => [
      e.date,
      e.category,
      e.note?.replace(/"/g, '""') || '',
      e.amount,
    ])

    const csvLines = [
      header.join(','),
      ...rows.map((r) =>
        r
          .map((value) => {
            const str = String(value ?? '')
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return '"' + str.replace(/"/g, '""') + '"'
            }
            return str
          })
          .join(',')
      ),
    ]
    const blob = new Blob([csvLines.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'expenses.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const exportExcel = () => {
    if (expenses.length === 0) return
    const data = expenses.map((e) => ({
      Date: e.date,
      Category: e.category,
      Note: e.note,
      Amount: e.amount,
    }))
    const worksheet = XLSX.utils.json_to_sheet(data)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Expenses')
    XLSX.writeFile(workbook, 'expenses.xlsx')
  }

  const exportPDF = () => {
    if (expenses.length === 0) return
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()

    doc.setFontSize(16)
    doc.text('Expense Report', pageWidth / 2, 16, { align: 'center' })

    doc.setFontSize(10)
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 26)
    doc.text(`Currency: ${currency}`, 14, 32)
    doc.text(`Month Filter: ${filterMonth}`, 14, 38)
    doc.text(`Total (All Time): ${fmt(totalAllTime)}`, 14, 44)
    doc.text(`Total (This Month): ${fmt(totalThisMonth)}`, 14, 50)
    if (Number(monthlyBudget) > 0) {
      doc.text(
        `Budget: ${fmt(monthlyBudget)} (${totalThisMonth > monthlyBudget ? 'Exceeded' : 'Within'})`,
        14,
        56
      )
    }

    let y = 68
    doc.setFontSize(11)
    doc.text('Date', 14, y)
    doc.text('Category', 46, y)
    doc.text('Note', 86, y)
    doc.text('Amount', pageWidth - 26, y, { align: 'right' })
    y += 4
    doc.line(14, y, pageWidth - 14, y)
    y += 6

    doc.setFontSize(9)
    for (const e of expenses) {
      if (y > 270) {
        doc.addPage()
        y = 20
      }
      doc.text(String(e.date), 14, y)
      doc.text(String(e.category), 46, y)
      const noteText = (e.note || '').toString()
      const splitNote = doc.splitTextToSize(noteText, pageWidth - 120)
      doc.text(splitNote, 86, y)
      doc.text(String(e.amount), pageWidth - 26, y, { align: 'right' })
      y += 6 + (splitNote.length - 1) * 4
    }

    doc.save('expenses.pdf')
  }

  const visibleExpenses = useMemo(
    () =>
      filteredByMonth
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [filteredByMonth]
  )

  // RENDER
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      {/* NAVBAR */}
     
<nav className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur px-4 py-3 dark:border-slate-800 dark:bg-slate-900/90">
  <div className="mx-auto flex max-w-6xl items-center justify-between">
    {/* Logo + Title */}
    <div className="flex items-center gap-2">
      <span className="rounded-lg bg-sky-500/10 p-1.5 text-sky-500">₽</span>
      <div>
        <h1 className="text-sm font-semibold tracking-tight sm:text-base">
          Expense Dashboard
        </h1>
        <p className="mt-0.5 hidden text-xs text-slate-500 dark:text-slate-400 sm:block">
          Track daily, monthly & yearly spending
        </p>
      </div>
    </div>

    {/* Toggle Button - MOBILE ONLY */}
    <button
      className="block sm:hidden p-2 rounded-lg border border-slate-300 dark:border-slate-700"
      onClick={() => setNavOpen(!navOpen)}
    >
      {navOpen ? "✕" : "☰"}
    </button>

    {/* Desktop Controls */}
    <div className="hidden sm:flex flex-wrap items-center gap-3 text-xs">
      {/* Currency */}
      <div className="flex flex-col">
        <span className="mb-0.5 text-[10px] uppercase text-slate-500">Currency</span>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="h-8 rounded-full border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="£">£ GBP</option>
          <option value="$">$ USD</option>
          <option value="€">€ EUR</option>
          <option value="₨">₨ PKR</option>
        </select>
      </div>

      {/* Month */}
      <div className="flex flex-col">
        <span className="mb-0.5 text-[10px] uppercase text-slate-500">Month</span>
        <input
          type="month"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="h-8 rounded-full border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      {/* Budget */}
      <div className="flex flex-col">
        <span className="mb-0.5 text-[10px] uppercase text-slate-500">Budget</span>
        <div className="flex h-8 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900">
          <span className="text-[11px] text-slate-400">{currency}</span>
          <input
            type="number"
            min="0"
            value={monthlyBudget}
            onChange={(e) => setMonthlyBudget(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-transparent text-xs outline-none"
          />
        </div>
      </div>

      {/* Theme */}
      <div className="flex flex-col">
        <span className="mb-0.5 text-[10px] uppercase text-slate-500">Theme</span>
        <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 text-[11px] dark:border-slate-700 dark:bg-slate-900">
          <button
            onClick={() => setTheme('light')}
            className={`px-2 py-0.5 rounded-full ${theme === 'light' && 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'}`}
          >
            Light
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={`px-2 py-0.5 rounded-full ${theme === 'dark' && 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'}`}
          >
            Dark
          </button>
          <button
            onClick={() => setTheme('system')}
            className={`px-2 py-0.5 rounded-full ${theme === 'system' && 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'}`}
          >
            Sys
          </button>
        </div>
      </div>
    </div>
  </div>

  {/* MOBILE DROPDOWN */}
  {/* MOBILE DROPDOWN */}
<div
  className={`
    sm:hidden border-t border-slate-200 dark:border-slate-800
    transition-all duration-300 ease-in-out overflow-hidden
    ${navOpen ? "max-h-[420px] opacity-100 mt-3" : "max-h-0 opacity-0 mt-0"}
  `}
>
  <div className="grid gap-4 text-xs py-3">
    {/* Currency */}
    <div className="flex justify-between items-center">
      <span>Currency</span>
      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        className="h-8 rounded border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900"
      >
        <option value="£">£</option>
        <option value="$">$</option>
        <option value="€">€</option>
        <option value="₨">₨</option>
      </select>
    </div>

    {/* Month */}
    <div className="flex justify-between items-center">
      <span>Month</span>
      <input
        type="month"
        value={filterMonth}
        onChange={(e) => setFilterMonth(e.target.value)}
        className="h-8 rounded border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900"
      />
    </div>

    {/* Budget */}
    <div className="flex justify-between items-center">
      <span>Budget</span>
      <input
        type="number"
        value={monthlyBudget}
        min="0"
        onChange={(e) => setMonthlyBudget(e.target.value)}
        className="h-8 rounded border border-slate-300 bg-white px-2 w-24 dark:border-slate-700 dark:bg-slate-900"
      />
    </div>

    {/* Theme */}
    <div className="flex justify-between items-center">
      <span>Theme</span>
      <div className="flex gap-1">
        <button onClick={() => setTheme('light')} className="px-2 py-0.5 rounded-full border">Light</button>
        <button onClick={() => setTheme('dark')} className="px-2 py-0.5 rounded-full border">Dark</button>
        <button onClick={() => setTheme('system')} className="px-2 py-0.5 rounded-full border">Sys</button>
      </div>
    </div>
  </div>
</div>

</nav>


      {/* MAIN */}
      <main className="mx-auto max-w-6xl px-4 pb-10 pt-4 sm:pt-6">
        {showBudgetAlert && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shadow-sm dark:border-red-500/40 dark:bg-red-900/20 dark:text-red-100">
            <div className="mt-0.5 h-5 w-5 flex-none rounded-full bg-red-500/10 text-center text-[11px] leading-5 text-red-600 dark:bg-red-500/20 dark:text-red-100">
              !
            </div>
            <div>
              <div className="font-semibold">Budget limit exceeded</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-red-700/90 dark:text-red-100/90">
                Your spending for <span className="font-semibold">{filterMonth}</span> is{' '}
                <span className="font-semibold">{fmt(totalThisMonth)}</span>, which is above your
                budget of <span className="font-semibold">{fmt(monthlyBudget)}</span>.
              </div>
            </div>
          </div>
        )}

        {/* TOP GRID */}
        <section className="grid gap-4 md:grid-cols-[1.6fr,1.3fr,1.1fr]">
          {/* Add expense */}
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-card dark:border-slate-800 dark:bg-slate-900/70">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Quick Add Expense
              </h2>
              <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-300">
                Live synced
              </span>
            </div>
            <div className="grid gap-3 text-xs sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Amount
                </label>
                <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none ring-sky-500/40 hover:border-slate-300 focus-within:border-sky-500 focus-within:ring-2 dark:border-slate-700 dark:bg-slate-900">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {currency}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="h-full flex-1 bg-transparent text-xs outline-none"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-2 text-xs outline-none ring-sky-500/40 hover:border-slate-300 focus:border-sky-500 focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-2 text-xs outline-none ring-sky-500/40 hover:border-slate-300 focus:border-sky-500 focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Note
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Groceries, rent..."
                  className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-2 text-xs outline-none ring-sky-500/40 hover:border-slate-300 focus:border-sky-500 focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            </div>
            <button
              onClick={handleAddExpense}
              className="mt-3 inline-flex items-center gap-1 rounded-full bg-sky-600 px-4 py-1.5 text-xs font-medium text-white shadow hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 dark:ring-offset-slate-900"
            >
              <span className="text-xs">＋</span>
              <span>Add Expense</span>
            </button>
          </div>

          {/* Stats */}
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-card dark:border-slate-800 dark:bg-slate-900/70">
            <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              Overview
            </h2>
            <div className="grid gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Today
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50">
                  {fmt(totalToday)}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                  {todayISO()}
                </div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  This Month
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50">
                  {fmt(totalThisMonth)}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                  Filter: {filterMonth}
                </div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  All Time
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50">
                  {fmt(totalAllTime)}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                  {expenses.length} record{expenses.length === 1 ? '' : 's'}
                </div>
              </div>
            </div>
          </div>

          {/* Exports */}
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-card dark:border-slate-800 dark:bg-slate-900/70">
            <h2 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              Exports
            </h2>
            <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
              Download your expense history for backup or sharing.
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                onClick={exportCSV}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700 hover:border-sky-500 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-500 dark:hover:text-sky-300"
              >
                CSV
              </button>
              <button
                onClick={exportExcel}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700 hover:border-emerald-500 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
              >
                Excel
              </button>
              <button
                onClick={exportPDF}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700 hover:border-rose-500 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-rose-500 dark:hover:text-rose-300"
              >
                PDF
              </button>
            </div>
          </div>
        </section>

         {/* Table */}
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-card dark:border-slate-800 dark:bg-slate-900/70">
          <div className="mb-2 flex items-baseline justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Expenses ({filterMonth})
              </h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {visibleExpenses.length} record{visibleExpenses.length === 1 ? '' : 's'} for this
                month.
              </p>
            </div>
          </div>
          {visibleExpenses.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400 dark:text-slate-500">
              No expenses for this month yet. Start by adding a new expense above.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-100 text-xs dark:border-slate-800">
              <div className="grid grid-cols-[100px,110px,minmax(0,1fr),90px,60px] bg-slate-50 px-3 py-2 font-semibold text-slate-500 dark:bg-slate-900/60 dark:text-slate-300">
                <span>Date</span>
                <span>Category</span>
                <span>Note</span>
                <span className="text-right">Amount</span>
                <span />
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleExpenses.map((e) => (
                  <div
                    key={e.id}
                    className="grid grid-cols-[100px,110px,minmax(0,1fr),90px,60px] items-center px-3 py-2 text-[11px] text-slate-700 dark:text-slate-200"
                  >
                    <span>{e.date}</span>
                    <span>{e.category}</span>
                    <span className="truncate">{e.note || '-'}</span>
                    <span className="text-right">{fmt(e.amount)}</span>
                    <span className="text-right">
                      <button
                        onClick={() => handleDeleteExpense(e.id)}
                        className="text-[11px] font-medium text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>

                        
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Charts row */}
        <section className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-card dark:border-slate-800 dark:bg-slate-900/70">
            <div className="mb-2 flex items-center justify-between text-xs">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Daily Trend ({filterMonth})
              </h2>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                Line chart · per day
              </span>
            </div>
            {dailyChartData.labels.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400 dark:text-slate-500">
                No data for selected month.
              </div>
            ) : (
              <div className="h-64">
                <Line
                  data={dailyChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                    },
                    scales: {
                      x: {
                        ticks: { font: { size: 10 } },
                        grid: { display: false },
                      },
                      y: {
                        ticks: { font: { size: 10 } },
                        grid: { color: 'rgba(148,163,184,0.25)' },
                      },
                    },
                  }}
                />
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-card dark:border-slate-800 dark:bg-slate-900/70">
            <div className="mb-2 flex items-center justify-between text-xs">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Category Split ({filterMonth})
              </h2>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                Pie chart · this month
              </span>
            </div>
            {categoryPieData.labels.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400 dark:text-slate-500">
                No category data for this month.
              </div>
            ) : (
              <div className="h-64">
                <Pie
                  data={categoryPieData}
                  options={{
                    plugins: {
                      legend: {
                        position: 'bottom',
                        labels: {
                          font: { size: 10 },
                          padding: 10,
                        },
                      },
                    },
                  }}
                />
              </div>
            )}
          </div>
        </section>

        {/* Bottom charts */}
        <section className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-card dark:border-slate-800 dark:bg-slate-900/70">
            <div className="mb-2 flex items-center justify-between text-xs">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Monthly Overview
              </h2>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                Bar chart · all time
              </span>
            </div>
            {monthlyChartData.labels.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400 dark:text-slate-500">
                Add expenses to see monthly trends.
              </div>
            ) : (
              <div className="h-64">
                <Bar
                  data={monthlyChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      x: {
                        ticks: { font: { size: 10 } },
                        grid: { display: false },
                      },
                      y: {
                        ticks: { font: { size: 10 } },
                        grid: { color: 'rgba(148,163,184,0.25)' },
                      },
                    },
                  }}
                />
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-card dark:border-slate-800 dark:bg-slate-900/70">
            <div className="mb-2 flex items-center justify-between text-xs">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Yearly Overview
              </h2>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                Bar chart · all time
              </span>
            </div>
            {yearlyChartData.labels.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400 dark:text-slate-500">
                Add expenses to see yearly trends.
              </div>
            ) : (
              <div className="h-64">
                <Bar
                  data={yearlyChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      x: {
                        ticks: { font: { size: 10 } },
                        grid: { display: false },
                      },
                      y: {
                        ticks: { font: { size: 10 } },
                        grid: { color: 'rgba(148,163,184,0.25)' },
                      },
                    },
                  }}
                />
              </div>
            )}
          </div>
        </section>
        <footer class="bg-neutral-primary">
          
            <div class="px-4 py-6 bg-neutral-secondary-soft md:flex md:items-center md:justify-between">
                <span class="text-sm text-body sm:text-center font-semibold text-slate-500 dark:text-slate-100">© {new Date().getFullYear()} <a href="https://saaduk.netlify.app/">Made with ♥ by Saad.</a>.
                </span>
              
              </div>
        </footer>

      </main>
      
    </div>
  )
}
