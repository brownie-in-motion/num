const compress = require('lz-string')
const express = require('express')

NY_TIMES_URL = 'https://www.nytimes.com/puzzles/sudoku'
SUDOKU_PAD_ROOT = 'https://sudokupad.app'

const dataCache = {
    lastUpdated: 0,
    data: {},
}
const getSudokuData = async () => {
    const now = Math.floor(Date.now() / (60 * 60 * 1000))
    if (now !== dataCache.lastUpdated) {
        const response = await fetch(NY_TIMES_URL)
        const data = await response.text()

        const search = 'window.gameData = '
        let extracted = data.substring(data.indexOf(search) + search.length)
        extracted = extracted.substring(0, extracted.indexOf('</script>'))

        dataCache.lastUpdated = now
        dataCache.data = JSON.parse(extracted)
    }
    return dataCache.data
}

const serializeBoard = (date, data) => {
    const day = data['day_of_week']
    const difficulty = data['difficulty']
    const { puzzle } = data['puzzle_data']

    const chunks = [[]]
    for (const number of puzzle) {
        if (chunks.at(-1).length === 9) chunks.push([])
        chunks.at(-1).push(number === 0 ? {} : { value: number, given: true })
    }

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
    }
}

const app = express()

app.get('/', async (_req, res) => {
    const data = await getResponseData()
    res.json(data)
})

app.listen(80)