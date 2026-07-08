'use strict'

// eslint-disable-next-line
const STR_ESCAPE = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/

// Lookup table of two-digit zero-padded strings ('00'..'99') used to format
// date components without allocating intermediate Date objects.
const PADDED_2 = []
for (let i = 0; i < 100; i++) {
  PADDED_2.push(String(i).padStart(2, '0'))
}

module.exports = class Serializer {
  constructor (options) {
    switch (options && options.rounding) {
      case 'floor':
        this.parseInteger = Math.floor
        break
      case 'ceil':
        this.parseInteger = Math.ceil
        break
      case 'round':
        this.parseInteger = Math.round
        break
      case 'trunc':
      default:
        this.parseInteger = Math.trunc
        break
    }
    this._options = options

    // An own-property closure avoids binding 'this' in the generated code,
    // which is faster to call than a bound function.
    const parseInteger = this.parseInteger
    this.asInteger = function asInteger (i) {
      if (Number.isInteger(i)) {
        return '' + i
      } else if (typeof i === 'bigint') {
        return i.toString()
      }
      const integer = parseInteger(i)
      // check if number is Infinity or NaN
      // eslint-disable-next-line no-self-compare
      if (integer === Infinity || integer === -Infinity || integer !== integer) {
        throw new Error(`The value "${i}" cannot be converted to an integer.`)
      }
      return '' + integer
    }
  }

  asNumber (i) {
    // fast cast to number
    const num = Number(i)
    // check if number is NaN
    // eslint-disable-next-line no-self-compare
    if (num !== num) {
      throw new Error(`The value "${i}" cannot be converted to a number.`)
    } else if (num === Infinity || num === -Infinity) {
      return 'null'
    } else {
      return '' + num
    }
  }

  asBoolean (bool) {
    return bool && 'true' || 'false' // eslint-disable-line
  }

  asDateTime (date) {
    if (date === null) return '""'
    if (date instanceof Date) {
      const year = date.getUTCFullYear()
      if (!(year >= 0 && year <= 9999)) {
        // toISOString handles the expanded year format and
        // throws a RangeError on invalid dates
        return '"' + date.toISOString() + '"'
      }
      const yearStr = year >= 1000 ? '' + year : ('000' + year).slice(-4)
      const msStr = ('' + (1000 + date.getUTCMilliseconds())).slice(1)
      return '"' + yearStr + '-' + PADDED_2[date.getUTCMonth() + 1] + '-' + PADDED_2[date.getUTCDate()] +
        'T' + PADDED_2[date.getUTCHours()] + ':' + PADDED_2[date.getUTCMinutes()] + ':' + PADDED_2[date.getUTCSeconds()] +
        '.' + msStr + 'Z"'
    }
    if (typeof date === 'string') {
      return '"' + date + '"'
    }
    throw new Error(`The value "${date}" cannot be converted to a date-time.`)
  }

  asDate (date) {
    if (date === null) return '""'
    if (date instanceof Date) {
      const year = date.getFullYear()
      if (!(year >= 0 && year <= 9999)) {
        // Slow path for expanded years and invalid dates: shifting by the
        // timezone offset makes toISOString print the local date
        return '"' + new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 10) + '"'
      }
      const yearStr = year >= 1000 ? '' + year : ('000' + year).slice(-4)
      return '"' + yearStr + '-' + PADDED_2[date.getMonth() + 1] + '-' + PADDED_2[date.getDate()] + '"'
    }
    if (typeof date === 'string') {
      return '"' + date + '"'
    }
    throw new Error(`The value "${date}" cannot be converted to a date.`)
  }

  asTime (date) {
    if (date === null) return '""'
    if (date instanceof Date) {
      const hours = date.getHours()
      // eslint-disable-next-line no-self-compare
      if (hours !== hours) {
        // Invalid date: let toISOString throw the same RangeError as before
        return '"' + new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(11, 19) + '"'
      }
      return '"' + PADDED_2[hours] + ':' + PADDED_2[date.getMinutes()] + ':' + PADDED_2[date.getSeconds()] + '"'
    }
    if (typeof date === 'string') {
      return '"' + date + '"'
    }
    throw new Error(`The value "${date}" cannot be converted to a time.`)
  }

  asString (str) {
    const len = str.length
    if (len === 0) {
      return '""'
    } else if (len < 42) {
      // magically escape strings for json
      // relying on their charCodeAt
      // everything below 32 needs JSON.stringify()
      // every string that contain surrogate needs JSON.stringify()
      // 34 and 92 happens all the time, so we
      // have a fast case for them
      let result = ''
      let last = -1
      let point = 255
      for (let i = 0; i < len; i++) {
        point = str.charCodeAt(i)
        if (
          point === 0x22 || // '"'
          point === 0x5c // '\'
        ) {
          last === -1 && (last = 0)
          result += str.slice(last, i) + '\\'
          last = i
        } else if (point < 32 || (point >= 0xD800 && point <= 0xDFFF)) {
          // The current character is non-printable characters or a surrogate.
          return JSON.stringify(str)
        }
      }
      return (last === -1 && ('"' + str + '"')) || ('"' + result + str.slice(last) + '"')
    } else if (len < 5000 && STR_ESCAPE.test(str) === false) {
      // Only use the regular expression for shorter input. The overhead is otherwise too much.
      return '"' + str + '"'
    } else {
      return JSON.stringify(str)
    }
  }

  asUnsafeString (str) {
    return '"' + str + '"'
  }

  getState () {
    return this._options
  }

  static restoreFromState (state) {
    return new Serializer(state)
  }
}
