const compress = require('lz-string')
const express = require('express')

const fs = require('fs')

const NY_TIMES_URL = 'https://www.nytimes.com/puzzles/sudoku'
const SUDOKU_PAD_ROOT = 'https://sudokupad.app'

const html = fs.readFileSync('index.html', 'utf8')

const dataCache = {
    lastUpdated: 0,
    data: {},
}
const hydrateSudokuData = async () => {
    const response = await fetch(NY_TIMES_URL)
    const data = await response.text()

    const search = 'window.gameData = '
    let extracted = data.substring(data.indexOf(search) + search.length)
    extracted = extracted.substring(0, extracted.indexOf('</script>'))

    dataCache.lastUpdated = Math.floor(Date.now() / (60 * 60 * 1000))
    dataCache.data = JSON.parse(extracted)
}

const getSudokuData = async () => {
    const now = Math.floor(Date.now() / (60 * 60 * 1000))
    if (now !== dataCache.lastUpdated) await hydrateSudokuData()
    return dataCache.data
}

const serializeBoard = (date, data) => {
    const day = data['day_of_week']
    const difficulty = data['difficulty']
    const { puzzle, solution } = data['puzzle_data']

    const chunks = []
    solution.forEach((value, i) => {
        if (i % 9 === 0) chunks.push([])
        chunks.at(-1).push({ value, given: puzzle[i] !== 0 })
    })

    return compress.compressToBase64(
        JSON.stringify({
            size: 9,
            title: `${day}, ${date} (${difficulty})`,
            author: 'NY Times',
            grid: chunks,
        }),
    )
}

const linkCache = new Map()
const createLink = async (data) => {
    if (!linkCache.has(data)) {
        const response = await fetch(`${SUDOKU_PAD_ROOT}/admin/createlink`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ puzzle: `fpuz${data}` }),
        })
        const { shortid } = await response.json()
        linkCache.set(data, shortid)
    }
    return `${SUDOKU_PAD_ROOT}/${linkCache.get(data)}`
}

const getResponseData = async () => {
    const { displayDate: date, easy, medium, hard } = await getSudokuData()
    const [e, m, h] = await Promise.all(
        [easy, medium, hard].map(async (board) => {
            const data = serializeBoard(date, board)
            return await createLink(data)
        }),
    )
    return {
        easy: e,
        medium: m,
        hard: h,
        date,
    }
}

const app = express()
app.use(express.static('public'))

app.get('/', async (_req, res) => {
    const data = await getResponseData()
    const rendered = html.replace(/{(\w+)}/g, (_, k) => data[k])
    res.send(rendered)
})

app.listen(8000)

setInterval(hydrateSudokuData, 10 * 60 * 1000)
