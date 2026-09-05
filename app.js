/* == QR library: qrcode-generator (c) Kazuhiko Arase, MIT License == */
//---------------------------------------------------------------------
//
// QR Code Generator for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//  http://www.opensource.org/licenses/mit-license.php
//
// The word 'QR Code' is registered trademark of
// DENSO WAVE INCORPORATED
//  http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------

var qrcode = function() {

  //---------------------------------------------------------------------
  // qrcode
  //---------------------------------------------------------------------

  /**
   * qrcode
   * @param typeNumber 1 to 40
   * @param errorCorrectionLevel 'L','M','Q','H'
   */
  var qrcode = function(typeNumber, errorCorrectionLevel) {

    var PAD0 = 0xEC;
    var PAD1 = 0x11;

    var _typeNumber = typeNumber;
    var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
    var _modules = null;
    var _moduleCount = 0;
    var _dataCache = null;
    var _dataList = [];

    var _this = {};

    var makeImpl = function(test, maskPattern) {

      _moduleCount = _typeNumber * 4 + 17;
      _modules = function(moduleCount) {
        var modules = new Array(moduleCount);
        for (var row = 0; row < moduleCount; row += 1) {
          modules[row] = new Array(moduleCount);
          for (var col = 0; col < moduleCount; col += 1) {
            modules[row][col] = null;
          }
        }
        return modules;
      }(_moduleCount);

      setupPositionProbePattern(0, 0);
      setupPositionProbePattern(_moduleCount - 7, 0);
      setupPositionProbePattern(0, _moduleCount - 7);
      setupPositionAdjustPattern();
      setupTimingPattern();
      setupTypeInfo(test, maskPattern);

      if (_typeNumber >= 7) {
        setupTypeNumber(test);
      }

      if (_dataCache == null) {
        _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
      }

      mapData(_dataCache, maskPattern);
    };

    var setupPositionProbePattern = function(row, col) {

      for (var r = -1; r <= 7; r += 1) {

        if (row + r <= -1 || _moduleCount <= row + r) continue;

        for (var c = -1; c <= 7; c += 1) {

          if (col + c <= -1 || _moduleCount <= col + c) continue;

          if ( (0 <= r && r <= 6 && (c == 0 || c == 6) )
              || (0 <= c && c <= 6 && (r == 0 || r == 6) )
              || (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
            _modules[row + r][col + c] = true;
          } else {
            _modules[row + r][col + c] = false;
          }
        }
      }
    };

    var getBestMaskPattern = function() {

      var minLostPoint = 0;
      var pattern = 0;

      for (var i = 0; i < 8; i += 1) {

        makeImpl(true, i);

        var lostPoint = QRUtil.getLostPoint(_this);

        if (i == 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }

      return pattern;
    };

    var setupTimingPattern = function() {

      for (var r = 8; r < _moduleCount - 8; r += 1) {
        if (_modules[r][6] != null) {
          continue;
        }
        _modules[r][6] = (r % 2 == 0);
      }

      for (var c = 8; c < _moduleCount - 8; c += 1) {
        if (_modules[6][c] != null) {
          continue;
        }
        _modules[6][c] = (c % 2 == 0);
      }
    };

    var setupPositionAdjustPattern = function() {

      var pos = QRUtil.getPatternPosition(_typeNumber);

      for (var i = 0; i < pos.length; i += 1) {

        for (var j = 0; j < pos.length; j += 1) {

          var row = pos[i];
          var col = pos[j];

          if (_modules[row][col] != null) {
            continue;
          }

          for (var r = -2; r <= 2; r += 1) {

            for (var c = -2; c <= 2; c += 1) {

              if (r == -2 || r == 2 || c == -2 || c == 2
                  || (r == 0 && c == 0) ) {
                _modules[row + r][col + c] = true;
              } else {
                _modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    };

    var setupTypeNumber = function(test) {

      var bits = QRUtil.getBCHTypeNumber(_typeNumber);

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
      }

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
      }
    };

    var setupTypeInfo = function(test, maskPattern) {

      var data = (_errorCorrectionLevel << 3) | maskPattern;
      var bits = QRUtil.getBCHTypeInfo(data);

      // vertical
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 6) {
          _modules[i][8] = mod;
        } else if (i < 8) {
          _modules[i + 1][8] = mod;
        } else {
          _modules[_moduleCount - 15 + i][8] = mod;
        }
      }

      // horizontal
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 8) {
          _modules[8][_moduleCount - i - 1] = mod;
        } else if (i < 9) {
          _modules[8][15 - i - 1 + 1] = mod;
        } else {
          _modules[8][15 - i - 1] = mod;
        }
      }

      // fixed module
      _modules[_moduleCount - 8][8] = (!test);
    };

    var mapData = function(data, maskPattern) {

      var inc = -1;
      var row = _moduleCount - 1;
      var bitIndex = 7;
      var byteIndex = 0;
      var maskFunc = QRUtil.getMaskFunction(maskPattern);

      for (var col = _moduleCount - 1; col > 0; col -= 2) {

        if (col == 6) col -= 1;

        while (true) {

          for (var c = 0; c < 2; c += 1) {

            if (_modules[row][col - c] == null) {

              var dark = false;

              if (byteIndex < data.length) {
                dark = ( ( (data[byteIndex] >>> bitIndex) & 1) == 1);
              }

              var mask = maskFunc(row, col - c);

              if (mask) {
                dark = !dark;
              }

              _modules[row][col - c] = dark;
              bitIndex -= 1;

              if (bitIndex == -1) {
                byteIndex += 1;
                bitIndex = 7;
              }
            }
          }

          row += inc;

          if (row < 0 || _moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    };

    var createBytes = function(buffer, rsBlocks) {

      var offset = 0;

      var maxDcCount = 0;
      var maxEcCount = 0;

      var dcdata = new Array(rsBlocks.length);
      var ecdata = new Array(rsBlocks.length);

      for (var r = 0; r < rsBlocks.length; r += 1) {

        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;

        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);

        dcdata[r] = new Array(dcCount);

        for (var i = 0; i < dcdata[r].length; i += 1) {
          dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
        }
        offset += dcCount;

        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);

        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var i = 0; i < ecdata[r].length; i += 1) {
          var modIndex = i + modPoly.getLength() - ecdata[r].length;
          ecdata[r][i] = (modIndex >= 0)? modPoly.getAt(modIndex) : 0;
        }
      }

      var totalCodeCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalCodeCount += rsBlocks[i].totalCount;
      }

      var data = new Array(totalCodeCount);
      var index = 0;

      for (var i = 0; i < maxDcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < dcdata[r].length) {
            data[index] = dcdata[r][i];
            index += 1;
          }
        }
      }

      for (var i = 0; i < maxEcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < ecdata[r].length) {
            data[index] = ecdata[r][i];
            index += 1;
          }
        }
      }

      return data;
    };

    var createData = function(typeNumber, errorCorrectionLevel, dataList) {

      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);

      var buffer = qrBitBuffer();

      for (var i = 0; i < dataList.length; i += 1) {
        var data = dataList[i];
        buffer.put(data.getMode(), 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
        data.write(buffer);
      }

      // calc num max data.
      var totalDataCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalDataCount += rsBlocks[i].dataCount;
      }

      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw 'code length overflow. ('
          + buffer.getLengthInBits()
          + '>'
          + totalDataCount * 8
          + ')';
      }

      // end code
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
      }

      // padding
      while (buffer.getLengthInBits() % 8 != 0) {
        buffer.putBit(false);
      }

      // padding
      while (true) {

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD0, 8);

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD1, 8);
      }

      return createBytes(buffer, rsBlocks);
    };

    _this.addData = function(data, mode) {

      mode = mode || 'Byte';

      var newData = null;

      switch(mode) {
      case 'Numeric' :
        newData = qrNumber(data);
        break;
      case 'Alphanumeric' :
        newData = qrAlphaNum(data);
        break;
      case 'Byte' :
        newData = qr8BitByte(data);
        break;
      case 'Kanji' :
        newData = qrKanji(data);
        break;
      default :
        throw 'mode:' + mode;
      }

      _dataList.push(newData);
      _dataCache = null;
    };

    _this.isDark = function(row, col) {
      if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
        throw row + ',' + col;
      }
      return _modules[row][col];
    };

    _this.getModuleCount = function() {
      return _moduleCount;
    };

    _this.make = function() {
      if (_typeNumber < 1) {
        var typeNumber = 1;

        for (; typeNumber < 40; typeNumber++) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, _errorCorrectionLevel);
          var buffer = qrBitBuffer();

          for (var i = 0; i < _dataList.length; i++) {
            var data = _dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
            data.write(buffer);
          }

          var totalDataCount = 0;
          for (var i = 0; i < rsBlocks.length; i++) {
            totalDataCount += rsBlocks[i].dataCount;
          }

          if (buffer.getLengthInBits() <= totalDataCount * 8) {
            break;
          }
        }

        _typeNumber = typeNumber;
      }

      makeImpl(false, getBestMaskPattern() );
    };

    _this.createTableTag = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var qrHtml = '';

      qrHtml += '<table style="';
      qrHtml += ' border-width: 0px; border-style: none;';
      qrHtml += ' border-collapse: collapse;';
      qrHtml += ' padding: 0px; margin: ' + margin + 'px;';
      qrHtml += '">';
      qrHtml += '<tbody>';

      for (var r = 0; r < _this.getModuleCount(); r += 1) {

        qrHtml += '<tr>';

        for (var c = 0; c < _this.getModuleCount(); c += 1) {
          qrHtml += '<td style="';
          qrHtml += ' border-width: 0px; border-style: none;';
          qrHtml += ' border-collapse: collapse;';
          qrHtml += ' padding: 0px; margin: 0px;';
          qrHtml += ' width: ' + cellSize + 'px;';
          qrHtml += ' height: ' + cellSize + 'px;';
          qrHtml += ' background-color: ';
          qrHtml += _this.isDark(r, c)? '#000000' : '#ffffff';
          qrHtml += ';';
          qrHtml += '"/>';
        }

        qrHtml += '</tr>';
      }

      qrHtml += '</tbody>';
      qrHtml += '</table>';

      return qrHtml;
    };

    _this.createSvgTag = function(cellSize, margin, alt, title) {

      var opts = {};
      if (typeof arguments[0] == 'object') {
        // Called by options.
        opts = arguments[0];
        // overwrite cellSize and margin.
        cellSize = opts.cellSize;
        margin = opts.margin;
        alt = opts.alt;
        title = opts.title;
      }

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      // Compose alt property surrogate
      alt = (typeof alt === 'string') ? {text: alt} : alt || {};
      alt.text = alt.text || null;
      alt.id = (alt.text) ? alt.id || 'qrcode-description' : null;

      // Compose title property surrogate
      title = (typeof title === 'string') ? {text: title} : title || {};
      title.text = title.text || null;
      title.id = (title.text) ? title.id || 'qrcode-title' : null;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var c, mc, r, mr, qrSvg='', rect;

      rect = 'l' + cellSize + ',0 0,' + cellSize +
        ' -' + cellSize + ',0 0,-' + cellSize + 'z ';

      qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
      qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : '';
      qrSvg += ' viewBox="0 0 ' + size + ' ' + size + '" ';
      qrSvg += ' preserveAspectRatio="xMinYMin meet"';
      qrSvg += (title.text || alt.text) ? ' role="img" aria-labelledby="' +
          escapeXml([title.id, alt.id].join(' ').trim() ) + '"' : '';
      qrSvg += '>';
      qrSvg += (title.text) ? '<title id="' + escapeXml(title.id) + '">' +
          escapeXml(title.text) + '</title>' : '';
      qrSvg += (alt.text) ? '<description id="' + escapeXml(alt.id) + '">' +
          escapeXml(alt.text) + '</description>' : '';
      qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
      qrSvg += '<path d="';

      for (r = 0; r < _this.getModuleCount(); r += 1) {
        mr = r * cellSize + margin;
        for (c = 0; c < _this.getModuleCount(); c += 1) {
          if (_this.isDark(r, c) ) {
            mc = c*cellSize+margin;
            qrSvg += 'M' + mc + ',' + mr + rect;
          }
        }
      }

      qrSvg += '" stroke="transparent" fill="black"/>';
      qrSvg += '</svg>';

      return qrSvg;
    };

    _this.createDataURL = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      return createDataURL(size, size, function(x, y) {
        if (min <= x && x < max && min <= y && y < max) {
          var c = Math.floor( (x - min) / cellSize);
          var r = Math.floor( (y - min) / cellSize);
          return _this.isDark(r, c)? 0 : 1;
        } else {
          return 1;
        }
      } );
    };

    _this.createImgTag = function(cellSize, margin, alt) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;

      var img = '';
      img += '<img';
      img += '\u0020src="';
      img += _this.createDataURL(cellSize, margin);
      img += '"';
      img += '\u0020width="';
      img += size;
      img += '"';
      img += '\u0020height="';
      img += size;
      img += '"';
      if (alt) {
        img += '\u0020alt="';
        img += escapeXml(alt);
        img += '"';
      }
      img += '/>';

      return img;
    };

    var escapeXml = function(s) {
      var escaped = '';
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charAt(i);
        switch(c) {
        case '<': escaped += '&lt;'; break;
        case '>': escaped += '&gt;'; break;
        case '&': escaped += '&amp;'; break;
        case '"': escaped += '&quot;'; break;
        default : escaped += c; break;
        }
      }
      return escaped;
    };

    var _createHalfASCII = function(margin) {
      var cellSize = 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r1, r2, p;

      var blocks = {
        '██': '█',
        '█ ': '▀',
        ' █': '▄',
        '  ': ' '
      };

      var blocksLastLineNoMargin = {
        '██': '▀',
        '█ ': '▀',
        ' █': ' ',
        '  ': ' '
      };

      var ascii = '';
      for (y = 0; y < size; y += 2) {
        r1 = Math.floor((y - min) / cellSize);
        r2 = Math.floor((y + 1 - min) / cellSize);
        for (x = 0; x < size; x += 1) {
          p = '█';

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
            p = ' ';
          }

          if (min <= x && x < max && min <= y+1 && y+1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
            p += ' ';
          }
          else {
            p += '█';
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          ascii += (margin < 1 && y+1 >= max) ? blocksLastLineNoMargin[p] : blocks[p];
        }

        ascii += '\n';
      }

      if (size % 2 && margin > 0) {
        return ascii.substring(0, ascii.length - size - 1) + Array(size+1).join('▀');
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.createASCII = function(cellSize, margin) {
      cellSize = cellSize || 1;

      if (cellSize < 2) {
        return _createHalfASCII(margin);
      }

      cellSize -= 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r, p;

      var white = Array(cellSize+1).join('██');
      var black = Array(cellSize+1).join('  ');

      var ascii = '';
      var line = '';
      for (y = 0; y < size; y += 1) {
        r = Math.floor( (y - min) / cellSize);
        line = '';
        for (x = 0; x < size; x += 1) {
          p = 1;

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
            p = 0;
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          line += p ? white : black;
        }

        for (r = 0; r < cellSize; r += 1) {
          ascii += line + '\n';
        }
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.renderTo2dContext = function(context, cellSize) {
      cellSize = cellSize || 2;
      var length = _this.getModuleCount();
      for (var row = 0; row < length; row++) {
        for (var col = 0; col < length; col++) {
          context.fillStyle = _this.isDark(row, col) ? 'black' : 'white';
          context.fillRect(row * cellSize, col * cellSize, cellSize, cellSize);
        }
      }
    }

    return _this;
  };

  //---------------------------------------------------------------------
  // qrcode.stringToBytes
  //---------------------------------------------------------------------

  qrcode.stringToBytesFuncs = {
    'default' : function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        bytes.push(c & 0xff);
      }
      return bytes;
    }
  };

  qrcode.stringToBytes = qrcode.stringToBytesFuncs['default'];

  //---------------------------------------------------------------------
  // qrcode.createStringToBytes
  //---------------------------------------------------------------------

  /**
   * @param unicodeData base64 string of byte array.
   * [16bit Unicode],[16bit Bytes], ...
   * @param numChars
   */
  qrcode.createStringToBytes = function(unicodeData, numChars) {

    // create conversion map.

    var unicodeMap = function() {

      var bin = base64DecodeInputStream(unicodeData);
      var read = function() {
        var b = bin.read();
        if (b == -1) throw 'eof';
        return b;
      };

      var count = 0;
      var unicodeMap = {};
      while (true) {
        var b0 = bin.read();
        if (b0 == -1) break;
        var b1 = read();
        var b2 = read();
        var b3 = read();
        var k = String.fromCharCode( (b0 << 8) | b1);
        var v = (b2 << 8) | b3;
        unicodeMap[k] = v;
        count += 1;
      }
      if (count != numChars) {
        throw count + ' != ' + numChars;
      }

      return unicodeMap;
    }();

    var unknownChar = '?'.charCodeAt(0);

    return function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        if (c < 128) {
          bytes.push(c);
        } else {
          var b = unicodeMap[s.charAt(i)];
          if (typeof b == 'number') {
            if ( (b & 0xff) == b) {
              // 1byte
              bytes.push(b);
            } else {
              // 2bytes
              bytes.push(b >>> 8);
              bytes.push(b & 0xff);
            }
          } else {
            bytes.push(unknownChar);
          }
        }
      }
      return bytes;
    };
  };

  //---------------------------------------------------------------------
  // QRMode
  //---------------------------------------------------------------------

  var QRMode = {
    MODE_NUMBER :    1 << 0,
    MODE_ALPHA_NUM : 1 << 1,
    MODE_8BIT_BYTE : 1 << 2,
    MODE_KANJI :     1 << 3
  };

  //---------------------------------------------------------------------
  // QRErrorCorrectionLevel
  //---------------------------------------------------------------------

  var QRErrorCorrectionLevel = {
    L : 1,
    M : 0,
    Q : 3,
    H : 2
  };

  //---------------------------------------------------------------------
  // QRMaskPattern
  //---------------------------------------------------------------------

  var QRMaskPattern = {
    PATTERN000 : 0,
    PATTERN001 : 1,
    PATTERN010 : 2,
    PATTERN011 : 3,
    PATTERN100 : 4,
    PATTERN101 : 5,
    PATTERN110 : 6,
    PATTERN111 : 7
  };

  //---------------------------------------------------------------------
  // QRUtil
  //---------------------------------------------------------------------

  var QRUtil = function() {

    var PATTERN_POSITION_TABLE = [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54],
      [6, 32, 58],
      [6, 34, 62],
      [6, 26, 46, 66],
      [6, 26, 48, 70],
      [6, 26, 50, 74],
      [6, 30, 54, 78],
      [6, 30, 56, 82],
      [6, 30, 58, 86],
      [6, 34, 62, 90],
      [6, 28, 50, 72, 94],
      [6, 26, 50, 74, 98],
      [6, 30, 54, 78, 102],
      [6, 28, 54, 80, 106],
      [6, 32, 58, 84, 110],
      [6, 30, 58, 86, 114],
      [6, 34, 62, 90, 118],
      [6, 26, 50, 74, 98, 122],
      [6, 30, 54, 78, 102, 126],
      [6, 26, 52, 78, 104, 130],
      [6, 30, 56, 82, 108, 134],
      [6, 34, 60, 86, 112, 138],
      [6, 30, 58, 86, 114, 142],
      [6, 34, 62, 90, 118, 146],
      [6, 30, 54, 78, 102, 126, 150],
      [6, 24, 50, 76, 102, 128, 154],
      [6, 28, 54, 80, 106, 132, 158],
      [6, 32, 58, 84, 110, 136, 162],
      [6, 26, 54, 82, 110, 138, 166],
      [6, 30, 58, 86, 114, 142, 170]
    ];
    var G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
    var G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
    var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

    var _this = {};

    var getBCHDigit = function(data) {
      var digit = 0;
      while (data != 0) {
        digit += 1;
        data >>>= 1;
      }
      return digit;
    };

    _this.getBCHTypeInfo = function(data) {
      var d = data << 10;
      while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
        d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15) ) );
      }
      return ( (data << 10) | d) ^ G15_MASK;
    };

    _this.getBCHTypeNumber = function(data) {
      var d = data << 12;
      while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
        d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18) ) );
      }
      return (data << 12) | d;
    };

    _this.getPatternPosition = function(typeNumber) {
      return PATTERN_POSITION_TABLE[typeNumber - 1];
    };

    _this.getMaskFunction = function(maskPattern) {

      switch (maskPattern) {

      case QRMaskPattern.PATTERN000 :
        return function(i, j) { return (i + j) % 2 == 0; };
      case QRMaskPattern.PATTERN001 :
        return function(i, j) { return i % 2 == 0; };
      case QRMaskPattern.PATTERN010 :
        return function(i, j) { return j % 3 == 0; };
      case QRMaskPattern.PATTERN011 :
        return function(i, j) { return (i + j) % 3 == 0; };
      case QRMaskPattern.PATTERN100 :
        return function(i, j) { return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 == 0; };
      case QRMaskPattern.PATTERN101 :
        return function(i, j) { return (i * j) % 2 + (i * j) % 3 == 0; };
      case QRMaskPattern.PATTERN110 :
        return function(i, j) { return ( (i * j) % 2 + (i * j) % 3) % 2 == 0; };
      case QRMaskPattern.PATTERN111 :
        return function(i, j) { return ( (i * j) % 3 + (i + j) % 2) % 2 == 0; };

      default :
        throw 'bad maskPattern:' + maskPattern;
      }
    };

    _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
      var a = qrPolynomial([1], 0);
      for (var i = 0; i < errorCorrectLength; i += 1) {
        a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0) );
      }
      return a;
    };

    _this.getLengthInBits = function(mode, type) {

      if (1 <= type && type < 10) {

        // 1 - 9

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 10;
        case QRMode.MODE_ALPHA_NUM : return 9;
        case QRMode.MODE_8BIT_BYTE : return 8;
        case QRMode.MODE_KANJI     : return 8;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 27) {

        // 10 - 26

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 12;
        case QRMode.MODE_ALPHA_NUM : return 11;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 10;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 41) {

        // 27 - 40

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 14;
        case QRMode.MODE_ALPHA_NUM : return 13;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 12;
        default :
          throw 'mode:' + mode;
        }

      } else {
        throw 'type:' + type;
      }
    };

    _this.getLostPoint = function(qrcode) {

      var moduleCount = qrcode.getModuleCount();

      var lostPoint = 0;

      // LEVEL1

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount; col += 1) {

          var sameCount = 0;
          var dark = qrcode.isDark(row, col);

          for (var r = -1; r <= 1; r += 1) {

            if (row + r < 0 || moduleCount <= row + r) {
              continue;
            }

            for (var c = -1; c <= 1; c += 1) {

              if (col + c < 0 || moduleCount <= col + c) {
                continue;
              }

              if (r == 0 && c == 0) {
                continue;
              }

              if (dark == qrcode.isDark(row + r, col + c) ) {
                sameCount += 1;
              }
            }
          }

          if (sameCount > 5) {
            lostPoint += (3 + sameCount - 5);
          }
        }
      };

      // LEVEL2

      for (var row = 0; row < moduleCount - 1; row += 1) {
        for (var col = 0; col < moduleCount - 1; col += 1) {
          var count = 0;
          if (qrcode.isDark(row, col) ) count += 1;
          if (qrcode.isDark(row + 1, col) ) count += 1;
          if (qrcode.isDark(row, col + 1) ) count += 1;
          if (qrcode.isDark(row + 1, col + 1) ) count += 1;
          if (count == 0 || count == 4) {
            lostPoint += 3;
          }
        }
      }

      // LEVEL3

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount - 6; col += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row, col + 1)
              &&  qrcode.isDark(row, col + 2)
              &&  qrcode.isDark(row, col + 3)
              &&  qrcode.isDark(row, col + 4)
              && !qrcode.isDark(row, col + 5)
              &&  qrcode.isDark(row, col + 6) ) {
            lostPoint += 40;
          }
        }
      }

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount - 6; row += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row + 1, col)
              &&  qrcode.isDark(row + 2, col)
              &&  qrcode.isDark(row + 3, col)
              &&  qrcode.isDark(row + 4, col)
              && !qrcode.isDark(row + 5, col)
              &&  qrcode.isDark(row + 6, col) ) {
            lostPoint += 40;
          }
        }
      }

      // LEVEL4

      var darkCount = 0;

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount; row += 1) {
          if (qrcode.isDark(row, col) ) {
            darkCount += 1;
          }
        }
      }

      var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
      lostPoint += ratio * 10;

      return lostPoint;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // QRMath
  //---------------------------------------------------------------------

  var QRMath = function() {

    var EXP_TABLE = new Array(256);
    var LOG_TABLE = new Array(256);

    // initialize tables
    for (var i = 0; i < 8; i += 1) {
      EXP_TABLE[i] = 1 << i;
    }
    for (var i = 8; i < 256; i += 1) {
      EXP_TABLE[i] = EXP_TABLE[i - 4]
        ^ EXP_TABLE[i - 5]
        ^ EXP_TABLE[i - 6]
        ^ EXP_TABLE[i - 8];
    }
    for (var i = 0; i < 255; i += 1) {
      LOG_TABLE[EXP_TABLE[i] ] = i;
    }

    var _this = {};

    _this.glog = function(n) {

      if (n < 1) {
        throw 'glog(' + n + ')';
      }

      return LOG_TABLE[n];
    };

    _this.gexp = function(n) {

      while (n < 0) {
        n += 255;
      }

      while (n >= 256) {
        n -= 255;
      }

      return EXP_TABLE[n];
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrPolynomial
  //---------------------------------------------------------------------

  function qrPolynomial(num, shift) {

    if (typeof num.length == 'undefined') {
      throw num.length + '/' + shift;
    }

    var _num = function() {
      var offset = 0;
      while (offset < num.length && num[offset] == 0) {
        offset += 1;
      }
      var _num = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i += 1) {
        _num[i] = num[i + offset];
      }
      return _num;
    }();

    var _this = {};

    _this.getAt = function(index) {
      return _num[index];
    };

    _this.getLength = function() {
      return _num.length;
    };

    _this.multiply = function(e) {

      var num = new Array(_this.getLength() + e.getLength() - 1);

      for (var i = 0; i < _this.getLength(); i += 1) {
        for (var j = 0; j < e.getLength(); j += 1) {
          num[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i) ) + QRMath.glog(e.getAt(j) ) );
        }
      }

      return qrPolynomial(num, 0);
    };

    _this.mod = function(e) {

      if (_this.getLength() - e.getLength() < 0) {
        return _this;
      }

      var ratio = QRMath.glog(_this.getAt(0) ) - QRMath.glog(e.getAt(0) );

      var num = new Array(_this.getLength() );
      for (var i = 0; i < _this.getLength(); i += 1) {
        num[i] = _this.getAt(i);
      }

      for (var i = 0; i < e.getLength(); i += 1) {
        num[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i) ) + ratio);
      }

      // recursive call
      return qrPolynomial(num, 0).mod(e);
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // QRRSBlock
  //---------------------------------------------------------------------

  var QRRSBlock = function() {

    var RS_BLOCK_TABLE = [

      // L
      // M
      // Q
      // H

      // 1
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],

      // 2
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],

      // 3
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],

      // 4
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],

      // 5
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],

      // 6
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],

      // 7
      [2, 98, 78],
      [4, 49, 31],
      [2, 32, 14, 4, 33, 15],
      [4, 39, 13, 1, 40, 14],

      // 8
      [2, 121, 97],
      [2, 60, 38, 2, 61, 39],
      [4, 40, 18, 2, 41, 19],
      [4, 40, 14, 2, 41, 15],

      // 9
      [2, 146, 116],
      [3, 58, 36, 2, 59, 37],
      [4, 36, 16, 4, 37, 17],
      [4, 36, 12, 4, 37, 13],

      // 10
      [2, 86, 68, 2, 87, 69],
      [4, 69, 43, 1, 70, 44],
      [6, 43, 19, 2, 44, 20],
      [6, 43, 15, 2, 44, 16],

      // 11
      [4, 101, 81],
      [1, 80, 50, 4, 81, 51],
      [4, 50, 22, 4, 51, 23],
      [3, 36, 12, 8, 37, 13],

      // 12
      [2, 116, 92, 2, 117, 93],
      [6, 58, 36, 2, 59, 37],
      [4, 46, 20, 6, 47, 21],
      [7, 42, 14, 4, 43, 15],

      // 13
      [4, 133, 107],
      [8, 59, 37, 1, 60, 38],
      [8, 44, 20, 4, 45, 21],
      [12, 33, 11, 4, 34, 12],

      // 14
      [3, 145, 115, 1, 146, 116],
      [4, 64, 40, 5, 65, 41],
      [11, 36, 16, 5, 37, 17],
      [11, 36, 12, 5, 37, 13],

      // 15
      [5, 109, 87, 1, 110, 88],
      [5, 65, 41, 5, 66, 42],
      [5, 54, 24, 7, 55, 25],
      [11, 36, 12, 7, 37, 13],

      // 16
      [5, 122, 98, 1, 123, 99],
      [7, 73, 45, 3, 74, 46],
      [15, 43, 19, 2, 44, 20],
      [3, 45, 15, 13, 46, 16],

      // 17
      [1, 135, 107, 5, 136, 108],
      [10, 74, 46, 1, 75, 47],
      [1, 50, 22, 15, 51, 23],
      [2, 42, 14, 17, 43, 15],

      // 18
      [5, 150, 120, 1, 151, 121],
      [9, 69, 43, 4, 70, 44],
      [17, 50, 22, 1, 51, 23],
      [2, 42, 14, 19, 43, 15],

      // 19
      [3, 141, 113, 4, 142, 114],
      [3, 70, 44, 11, 71, 45],
      [17, 47, 21, 4, 48, 22],
      [9, 39, 13, 16, 40, 14],

      // 20
      [3, 135, 107, 5, 136, 108],
      [3, 67, 41, 13, 68, 42],
      [15, 54, 24, 5, 55, 25],
      [15, 43, 15, 10, 44, 16],

      // 21
      [4, 144, 116, 4, 145, 117],
      [17, 68, 42],
      [17, 50, 22, 6, 51, 23],
      [19, 46, 16, 6, 47, 17],

      // 22
      [2, 139, 111, 7, 140, 112],
      [17, 74, 46],
      [7, 54, 24, 16, 55, 25],
      [34, 37, 13],

      // 23
      [4, 151, 121, 5, 152, 122],
      [4, 75, 47, 14, 76, 48],
      [11, 54, 24, 14, 55, 25],
      [16, 45, 15, 14, 46, 16],

      // 24
      [6, 147, 117, 4, 148, 118],
      [6, 73, 45, 14, 74, 46],
      [11, 54, 24, 16, 55, 25],
      [30, 46, 16, 2, 47, 17],

      // 25
      [8, 132, 106, 4, 133, 107],
      [8, 75, 47, 13, 76, 48],
      [7, 54, 24, 22, 55, 25],
      [22, 45, 15, 13, 46, 16],

      // 26
      [10, 142, 114, 2, 143, 115],
      [19, 74, 46, 4, 75, 47],
      [28, 50, 22, 6, 51, 23],
      [33, 46, 16, 4, 47, 17],

      // 27
      [8, 152, 122, 4, 153, 123],
      [22, 73, 45, 3, 74, 46],
      [8, 53, 23, 26, 54, 24],
      [12, 45, 15, 28, 46, 16],

      // 28
      [3, 147, 117, 10, 148, 118],
      [3, 73, 45, 23, 74, 46],
      [4, 54, 24, 31, 55, 25],
      [11, 45, 15, 31, 46, 16],

      // 29
      [7, 146, 116, 7, 147, 117],
      [21, 73, 45, 7, 74, 46],
      [1, 53, 23, 37, 54, 24],
      [19, 45, 15, 26, 46, 16],

      // 30
      [5, 145, 115, 10, 146, 116],
      [19, 75, 47, 10, 76, 48],
      [15, 54, 24, 25, 55, 25],
      [23, 45, 15, 25, 46, 16],

      // 31
      [13, 145, 115, 3, 146, 116],
      [2, 74, 46, 29, 75, 47],
      [42, 54, 24, 1, 55, 25],
      [23, 45, 15, 28, 46, 16],

      // 32
      [17, 145, 115],
      [10, 74, 46, 23, 75, 47],
      [10, 54, 24, 35, 55, 25],
      [19, 45, 15, 35, 46, 16],

      // 33
      [17, 145, 115, 1, 146, 116],
      [14, 74, 46, 21, 75, 47],
      [29, 54, 24, 19, 55, 25],
      [11, 45, 15, 46, 46, 16],

      // 34
      [13, 145, 115, 6, 146, 116],
      [14, 74, 46, 23, 75, 47],
      [44, 54, 24, 7, 55, 25],
      [59, 46, 16, 1, 47, 17],

      // 35
      [12, 151, 121, 7, 152, 122],
      [12, 75, 47, 26, 76, 48],
      [39, 54, 24, 14, 55, 25],
      [22, 45, 15, 41, 46, 16],

      // 36
      [6, 151, 121, 14, 152, 122],
      [6, 75, 47, 34, 76, 48],
      [46, 54, 24, 10, 55, 25],
      [2, 45, 15, 64, 46, 16],

      // 37
      [17, 152, 122, 4, 153, 123],
      [29, 74, 46, 14, 75, 47],
      [49, 54, 24, 10, 55, 25],
      [24, 45, 15, 46, 46, 16],

      // 38
      [4, 152, 122, 18, 153, 123],
      [13, 74, 46, 32, 75, 47],
      [48, 54, 24, 14, 55, 25],
      [42, 45, 15, 32, 46, 16],

      // 39
      [20, 147, 117, 4, 148, 118],
      [40, 75, 47, 7, 76, 48],
      [43, 54, 24, 22, 55, 25],
      [10, 45, 15, 67, 46, 16],

      // 40
      [19, 148, 118, 6, 149, 119],
      [18, 75, 47, 31, 76, 48],
      [34, 54, 24, 34, 55, 25],
      [20, 45, 15, 61, 46, 16]
    ];

    var qrRSBlock = function(totalCount, dataCount) {
      var _this = {};
      _this.totalCount = totalCount;
      _this.dataCount = dataCount;
      return _this;
    };

    var _this = {};

    var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {

      switch(errorCorrectionLevel) {
      case QRErrorCorrectionLevel.L :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case QRErrorCorrectionLevel.M :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case QRErrorCorrectionLevel.Q :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case QRErrorCorrectionLevel.H :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
      default :
        return undefined;
      }
    };

    _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {

      var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);

      if (typeof rsBlock == 'undefined') {
        throw 'bad rs block @ typeNumber:' + typeNumber +
            '/errorCorrectionLevel:' + errorCorrectionLevel;
      }

      var length = rsBlock.length / 3;

      var list = [];

      for (var i = 0; i < length; i += 1) {

        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];

        for (var j = 0; j < count; j += 1) {
          list.push(qrRSBlock(totalCount, dataCount) );
        }
      }

      return list;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrBitBuffer
  //---------------------------------------------------------------------

  var qrBitBuffer = function() {

    var _buffer = [];
    var _length = 0;

    var _this = {};

    _this.getBuffer = function() {
      return _buffer;
    };

    _this.getAt = function(index) {
      var bufIndex = Math.floor(index / 8);
      return ( (_buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
    };

    _this.put = function(num, length) {
      for (var i = 0; i < length; i += 1) {
        _this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
      }
    };

    _this.getLengthInBits = function() {
      return _length;
    };

    _this.putBit = function(bit) {

      var bufIndex = Math.floor(_length / 8);
      if (_buffer.length <= bufIndex) {
        _buffer.push(0);
      }

      if (bit) {
        _buffer[bufIndex] |= (0x80 >>> (_length % 8) );
      }

      _length += 1;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrNumber
  //---------------------------------------------------------------------

  var qrNumber = function(data) {

    var _mode = QRMode.MODE_NUMBER;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var data = _data;

      var i = 0;

      while (i + 2 < data.length) {
        buffer.put(strToNum(data.substring(i, i + 3) ), 10);
        i += 3;
      }

      if (i < data.length) {
        if (data.length - i == 1) {
          buffer.put(strToNum(data.substring(i, i + 1) ), 4);
        } else if (data.length - i == 2) {
          buffer.put(strToNum(data.substring(i, i + 2) ), 7);
        }
      }
    };

    var strToNum = function(s) {
      var num = 0;
      for (var i = 0; i < s.length; i += 1) {
        num = num * 10 + chatToNum(s.charAt(i) );
      }
      return num;
    };

    var chatToNum = function(c) {
      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      }
      throw 'illegal char :' + c;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrAlphaNum
  //---------------------------------------------------------------------

  var qrAlphaNum = function(data) {

    var _mode = QRMode.MODE_ALPHA_NUM;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var s = _data;

      var i = 0;

      while (i + 1 < s.length) {
        buffer.put(
          getCode(s.charAt(i) ) * 45 +
          getCode(s.charAt(i + 1) ), 11);
        i += 2;
      }

      if (i < s.length) {
        buffer.put(getCode(s.charAt(i) ), 6);
      }
    };

    var getCode = function(c) {

      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      } else if ('A' <= c && c <= 'Z') {
        return c.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
      } else {
        switch (c) {
        case ' ' : return 36;
        case '$' : return 37;
        case '%' : return 38;
        case '*' : return 39;
        case '+' : return 40;
        case '-' : return 41;
        case '.' : return 42;
        case '/' : return 43;
        case ':' : return 44;
        default :
          throw 'illegal char :' + c;
        }
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qr8BitByte
  //---------------------------------------------------------------------

  var qr8BitByte = function(data) {

    var _mode = QRMode.MODE_8BIT_BYTE;
    var _data = data;
    var _bytes = qrcode.stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _bytes.length;
    };

    _this.write = function(buffer) {
      for (var i = 0; i < _bytes.length; i += 1) {
        buffer.put(_bytes[i], 8);
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrKanji
  //---------------------------------------------------------------------

  var qrKanji = function(data) {

    var _mode = QRMode.MODE_KANJI;
    var _data = data;

    var stringToBytes = qrcode.stringToBytesFuncs['SJIS'];
    if (!stringToBytes) {
      throw 'sjis not supported.';
    }
    !function(c, code) {
      // self test for sjis support.
      var test = stringToBytes(c);
      if (test.length != 2 || ( (test[0] << 8) | test[1]) != code) {
        throw 'sjis not supported.';
      }
    }('\u53cb', 0x9746);

    var _bytes = stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return ~~(_bytes.length / 2);
    };

    _this.write = function(buffer) {

      var data = _bytes;

      var i = 0;

      while (i + 1 < data.length) {

        var c = ( (0xff & data[i]) << 8) | (0xff & data[i + 1]);

        if (0x8140 <= c && c <= 0x9FFC) {
          c -= 0x8140;
        } else if (0xE040 <= c && c <= 0xEBBF) {
          c -= 0xC140;
        } else {
          throw 'illegal char at ' + (i + 1) + '/' + c;
        }

        c = ( (c >>> 8) & 0xff) * 0xC0 + (c & 0xff);

        buffer.put(c, 13);

        i += 2;
      }

      if (i < data.length) {
        throw 'illegal char at ' + (i + 1);
      }
    };

    return _this;
  };

  //=====================================================================
  // GIF Support etc.
  //

  //---------------------------------------------------------------------
  // byteArrayOutputStream
  //---------------------------------------------------------------------

  var byteArrayOutputStream = function() {

    var _bytes = [];

    var _this = {};

    _this.writeByte = function(b) {
      _bytes.push(b & 0xff);
    };

    _this.writeShort = function(i) {
      _this.writeByte(i);
      _this.writeByte(i >>> 8);
    };

    _this.writeBytes = function(b, off, len) {
      off = off || 0;
      len = len || b.length;
      for (var i = 0; i < len; i += 1) {
        _this.writeByte(b[i + off]);
      }
    };

    _this.writeString = function(s) {
      for (var i = 0; i < s.length; i += 1) {
        _this.writeByte(s.charCodeAt(i) );
      }
    };

    _this.toByteArray = function() {
      return _bytes;
    };

    _this.toString = function() {
      var s = '';
      s += '[';
      for (var i = 0; i < _bytes.length; i += 1) {
        if (i > 0) {
          s += ',';
        }
        s += _bytes[i];
      }
      s += ']';
      return s;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64EncodeOutputStream
  //---------------------------------------------------------------------

  var base64EncodeOutputStream = function() {

    var _buffer = 0;
    var _buflen = 0;
    var _length = 0;
    var _base64 = '';

    var _this = {};

    var writeEncoded = function(b) {
      _base64 += String.fromCharCode(encode(b & 0x3f) );
    };

    var encode = function(n) {
      if (n < 0) {
        // error.
      } else if (n < 26) {
        return 0x41 + n;
      } else if (n < 52) {
        return 0x61 + (n - 26);
      } else if (n < 62) {
        return 0x30 + (n - 52);
      } else if (n == 62) {
        return 0x2b;
      } else if (n == 63) {
        return 0x2f;
      }
      throw 'n:' + n;
    };

    _this.writeByte = function(n) {

      _buffer = (_buffer << 8) | (n & 0xff);
      _buflen += 8;
      _length += 1;

      while (_buflen >= 6) {
        writeEncoded(_buffer >>> (_buflen - 6) );
        _buflen -= 6;
      }
    };

    _this.flush = function() {

      if (_buflen > 0) {
        writeEncoded(_buffer << (6 - _buflen) );
        _buffer = 0;
        _buflen = 0;
      }

      if (_length % 3 != 0) {
        // padding
        var padlen = 3 - _length % 3;
        for (var i = 0; i < padlen; i += 1) {
          _base64 += '=';
        }
      }
    };

    _this.toString = function() {
      return _base64;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64DecodeInputStream
  //---------------------------------------------------------------------

  var base64DecodeInputStream = function(str) {

    var _str = str;
    var _pos = 0;
    var _buffer = 0;
    var _buflen = 0;

    var _this = {};

    _this.read = function() {

      while (_buflen < 8) {

        if (_pos >= _str.length) {
          if (_buflen == 0) {
            return -1;
          }
          throw 'unexpected end of file./' + _buflen;
        }

        var c = _str.charAt(_pos);
        _pos += 1;

        if (c == '=') {
          _buflen = 0;
          return -1;
        } else if (c.match(/^\s$/) ) {
          // ignore if whitespace.
          continue;
        }

        _buffer = (_buffer << 6) | decode(c.charCodeAt(0) );
        _buflen += 6;
      }

      var n = (_buffer >>> (_buflen - 8) ) & 0xff;
      _buflen -= 8;
      return n;
    };

    var decode = function(c) {
      if (0x41 <= c && c <= 0x5a) {
        return c - 0x41;
      } else if (0x61 <= c && c <= 0x7a) {
        return c - 0x61 + 26;
      } else if (0x30 <= c && c <= 0x39) {
        return c - 0x30 + 52;
      } else if (c == 0x2b) {
        return 62;
      } else if (c == 0x2f) {
        return 63;
      } else {
        throw 'c:' + c;
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // gifImage (B/W)
  //---------------------------------------------------------------------

  var gifImage = function(width, height) {

    var _width = width;
    var _height = height;
    var _data = new Array(width * height);

    var _this = {};

    _this.setPixel = function(x, y, pixel) {
      _data[y * _width + x] = pixel;
    };

    _this.write = function(out) {

      //---------------------------------
      // GIF Signature

      out.writeString('GIF87a');

      //---------------------------------
      // Screen Descriptor

      out.writeShort(_width);
      out.writeShort(_height);

      out.writeByte(0x80); // 2bit
      out.writeByte(0);
      out.writeByte(0);

      //---------------------------------
      // Global Color Map

      // black
      out.writeByte(0x00);
      out.writeByte(0x00);
      out.writeByte(0x00);

      // white
      out.writeByte(0xff);
      out.writeByte(0xff);
      out.writeByte(0xff);

      //---------------------------------
      // Image Descriptor

      out.writeString(',');
      out.writeShort(0);
      out.writeShort(0);
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(0);

      //---------------------------------
      // Local Color Map

      //---------------------------------
      // Raster Data

      var lzwMinCodeSize = 2;
      var raster = getLZWRaster(lzwMinCodeSize);

      out.writeByte(lzwMinCodeSize);

      var offset = 0;

      while (raster.length - offset > 255) {
        out.writeByte(255);
        out.writeBytes(raster, offset, 255);
        offset += 255;
      }

      out.writeByte(raster.length - offset);
      out.writeBytes(raster, offset, raster.length - offset);
      out.writeByte(0x00);

      //---------------------------------
      // GIF Terminator
      out.writeString(';');
    };

    var bitOutputStream = function(out) {

      var _out = out;
      var _bitLength = 0;
      var _bitBuffer = 0;

      var _this = {};

      _this.write = function(data, length) {

        if ( (data >>> length) != 0) {
          throw 'length over';
        }

        while (_bitLength + length >= 8) {
          _out.writeByte(0xff & ( (data << _bitLength) | _bitBuffer) );
          length -= (8 - _bitLength);
          data >>>= (8 - _bitLength);
          _bitBuffer = 0;
          _bitLength = 0;
        }

        _bitBuffer = (data << _bitLength) | _bitBuffer;
        _bitLength = _bitLength + length;
      };

      _this.flush = function() {
        if (_bitLength > 0) {
          _out.writeByte(_bitBuffer);
        }
      };

      return _this;
    };

    var getLZWRaster = function(lzwMinCodeSize) {

      var clearCode = 1 << lzwMinCodeSize;
      var endCode = (1 << lzwMinCodeSize) + 1;
      var bitLength = lzwMinCodeSize + 1;

      // Setup LZWTable
      var table = lzwTable();

      for (var i = 0; i < clearCode; i += 1) {
        table.add(String.fromCharCode(i) );
      }
      table.add(String.fromCharCode(clearCode) );
      table.add(String.fromCharCode(endCode) );

      var byteOut = byteArrayOutputStream();
      var bitOut = bitOutputStream(byteOut);

      // clear code
      bitOut.write(clearCode, bitLength);

      var dataIndex = 0;

      var s = String.fromCharCode(_data[dataIndex]);
      dataIndex += 1;

      while (dataIndex < _data.length) {

        var c = String.fromCharCode(_data[dataIndex]);
        dataIndex += 1;

        if (table.contains(s + c) ) {

          s = s + c;

        } else {

          bitOut.write(table.indexOf(s), bitLength);

          if (table.size() < 0xfff) {

            if (table.size() == (1 << bitLength) ) {
              bitLength += 1;
            }

            table.add(s + c);
          }

          s = c;
        }
      }

      bitOut.write(table.indexOf(s), bitLength);

      // end code
      bitOut.write(endCode, bitLength);

      bitOut.flush();

      return byteOut.toByteArray();
    };

    var lzwTable = function() {

      var _map = {};
      var _size = 0;

      var _this = {};

      _this.add = function(key) {
        if (_this.contains(key) ) {
          throw 'dup key:' + key;
        }
        _map[key] = _size;
        _size += 1;
      };

      _this.size = function() {
        return _size;
      };

      _this.indexOf = function(key) {
        return _map[key];
      };

      _this.contains = function(key) {
        return typeof _map[key] != 'undefined';
      };

      return _this;
    };

    return _this;
  };

  var createDataURL = function(width, height, getPixel) {
    var gif = gifImage(width, height);
    for (var y = 0; y < height; y += 1) {
      for (var x = 0; x < width; x += 1) {
        gif.setPixel(x, y, getPixel(x, y) );
      }
    }

    var b = byteArrayOutputStream();
    gif.write(b);

    var base64 = base64EncodeOutputStream();
    var bytes = b.toByteArray();
    for (var i = 0; i < bytes.length; i += 1) {
      base64.writeByte(bytes[i]);
    }
    base64.flush();

    return 'data:image/gif;base64,' + base64;
  };

  //---------------------------------------------------------------------
  // returns qrcode function.

  return qrcode;
}();

// multibyte support
!function() {

  qrcode.stringToBytesFuncs['UTF-8'] = function(s) {
    // http://stackoverflow.com/questions/18729405/how-to-convert-utf8-string-to-byte-array
    function toUTF8Array(str) {
      var utf8 = [];
      for (var i=0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
          utf8.push(0xc0 | (charcode >> 6),
              0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000) {
          utf8.push(0xe0 | (charcode >> 12),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
        // surrogate pair
        else {
          i++;
          // UTF-16 encodes 0x10000-0x10FFFF by
          // subtracting 0x10000 and splitting the
          // 20 bits of 0x0-0xFFFFF into two halves
          charcode = 0x10000 + (((charcode & 0x3ff)<<10)
            | (str.charCodeAt(i) & 0x3ff));
          utf8.push(0xf0 | (charcode >>18),
              0x80 | ((charcode>>12) & 0x3f),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
      }
      return utf8;
    }
    return toUTF8Array(s);
  };

}();

// == /QR library ==
"use strict";
/* ================= 通用工具 ================= */
function b64d(s){
  s=String(s).trim().replace(/-/g,'+').replace(/_/g,'/');
  s+='='.repeat((4-(s.length%4))%4);
  try{ return decodeURIComponent(escape(atob(s))); }
  catch(e){ try{ return atob(s); }catch(e2){ return null; } }
}
function b64e(s){ try{ return btoa(unescape(encodeURIComponent(s))); }catch(e){ return btoa(s); } }
function esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function qs2obj(q){
  const o={};
  String(q||'').split('&').forEach(p=>{ if(!p) return;
    const i=p.indexOf('=');
    const k=decodeURIComponent(i<0?p:p.slice(0,i));
    if(!(k in o)) o[k]= i<0?'':decodeURIComponent(p.slice(i+1).replace(/\+/g,' '));
  });
  return o;
}
function obj2qs(o){
  return Object.entries(o).filter(([k,v])=>v!==undefined&&v!==null&&v!=='')
    .map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
}
function splitHostPort(hp,def){
  hp=String(hp||'');
  if(hp.startsWith('[')){ const e=hp.indexOf(']'); return [hp.slice(1,e), hp.slice(e+2)?+hp.slice(e+2):def]; }
  const i=hp.lastIndexOf(':');
  if(i>0 && /^\d+$/.test(hp.slice(i+1))) return [hp.slice(0,i), +hp.slice(i+1)];
  return [hp, def];
}
function splitComma(s){
  const out=[]; let cur='', q=null;
  for(let i=0;i<s.length;i++){ const c=s[i];
    if(q){ cur+=c; if(c===q) q=null; continue; }
    if(c==='"'||c==="'"){ q=c; cur+=c; continue; }
    if(c===','){ out.push(cur.trim()); cur=''; continue; }
    cur+=c;
  }
  if(cur.trim()) out.push(cur.trim());
  return out;
}
function trimStr(s){ return String(s==null?'':s).trim(); }

/* ================= YAML 解析（子集） ================= */
function stripComment(s){
  let out='', q=null;
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(q){ out+=c; if(c===q) q=null; continue; }
    if(c==='"'||c==="'"){ q=c; out+=c; continue; }
    if(c==='#' && (i===0||/\s/.test(s[i-1]))) break;
    out+=c;
  }
  return out;
}
function parseYAML(text){
  const lines=[];
  String(text).replace(/\t/g,'   ').split(/\r?\n/).forEach(r=>{
    const s=stripComment(r).replace(/\s+$/,'');
    if(!s.trim()) return;
    lines.push({ind:s.length-s.trimStart().length, txt:s.trim()});
  });
  if(!lines.length) return {};
  let i=0;

  function parseScalar(s){
    s=trimStr(s);
    if(s==='') return null;
    if(s.length>1 && s[0]==='"' && s[s.length-1]==='"'){ try{ return JSON.parse(s); }catch(e){ return s.slice(1,-1); } }
    if(s.length>1 && s[0]==="'" && s[s.length-1]==="'") return s.slice(1,-1).replace(/''/g,"'");
    if(s==='true'||s==='True') return true;
    if(s==='false'||s==='False') return false;
    if(s==='null'||s==='~') return null;
    if(/^[{[]/.test(s)) return parseFlow(s);
    if(/^-?[\d.]+$/.test(s)&&!/^[\d.]*\D[\d.]*$/.test(s.replace(/^\d+\.?\d*$/,''))) {}
    if(/^[+-]?\d+$/.test(s)) return parseInt(s,10);
    if(/^[+-]?\d*\.\d+$/.test(s)) return parseFloat(s);
    return s;
  }
  function parseFlow(s){
    let p=0;
    const ws=()=>{ while(p<s.length&&/\s/.test(s[p])) p++; };
    function value(){ ws(); return s[p]==='['?arr():s[p]==='{'?obj():tok(); }
    function arr(){ p++; const a=[]; ws(); if(s[p]===']'){p++; return a;}
      while(p<s.length){ a.push(value()); ws();
        if(s[p]===','){ p++; continue; } if(s[p]===']'){ p++; break; } break; }
      return a; }
    function obj(){ p++; const o={}; ws(); if(s[p]==='}'){ p++; return o; }
      while(p<s.length){ ws(); const k=fkey(); ws();
        if(s[p]===':'){ p++; o[k]=value(); } else o[k]=null;
        ws(); if(s[p]===','){ p++; continue; } if(s[p]==='}'){ p++; break; } break; }
      return o; }
    function fkey(){ ws();
      if(s[p]==='"'||s[p]==="'"){ const q=s[p]; let t=''; p++;
        while(p<s.length&&s[p]!==q) t+=s[p++]; p++; return t; }
      let t=''; while(p<s.length && s[p]!==':' && !/[,{}\s]/.test(s[p])) t+=s[p++]; return t; }
    function tok(){ let t='';
      while(p<s.length){ const c=s[p];
        if(c===','||c===']'||c==='}') break;
        if(c==='"'||c==="'"){ const q=c; t+=c; p++;
          while(p<s.length&&s[p]!==q){ t+=s[p++]; } if(p<s.length){ t+=s[p++]; } continue; }
        t+=c; p++; }
      return parseScalar(t); }
    return value();
  }
  function splitKey(txt){
    let m=/^"((?:[^"\\]|\\.)*)"\s*:\s*(.*)$/.exec(txt); if(m) return {k:m[1],v:m[2]};
    m=/^'([^']*)'\s*:\s*(.*)$/.exec(txt); if(m) return {k:m[1],v:m[2]};
    m=/^("[^"]*"|'[^']*'|[^:\s][^:]*?)\s*:\s*(.*)$/.exec(txt); if(m) return {k:m[1].trim(),v:m[2]};
    return null;
  }
  function parseNode(ind){
    if(i>=lines.length) return null;
    return /^-(\s|$)/.test(lines[i].txt) ? parseSeq(ind) : parseMap(ind);
  }
  function parseSeq(ind){
    const a=[];
    while(i<lines.length && lines[i].ind===ind && /^-(\s|$)/.test(lines[i].txt)){
      const full=lines[i].txt, rest=full.replace(/^-\s*/,''), ci=ind+(full.length-rest.length);
      i++;
      if(rest===''){ if(i<lines.length&&lines[i].ind>ind) a.push(parseNode(lines[i].ind)); else a.push(null); }
      else if(/^[{[]/.test(rest)) a.push(parseFlow(rest));
      else{ const ent=splitKey(rest);
        if(ent){ const o={}; collectMap(o,ent,ci);
          // 同一序列项的后续兄弟键（缩进等于 ci）
          while(i<lines.length&&lines[i].ind===ci&&!/^-(\s|$)/.test(lines[i].txt)){
            const e2=splitKey(lines[i].txt); i++;
            if(!e2) break; collectMap(o,e2,ci);
          }
          a.push(o);
        }
        else a.push(parseScalar(rest)); }
    }
    return a;
  }
  function parseMap(ind){
    const o={};
    while(i<lines.length && lines[i].ind===ind && !/^-(\s|$)/.test(lines[i].txt)){
      const ent=splitKey(lines[i].txt); i++;
      if(!ent) continue;
      collectMap(o,ent,ind);
    }
    return o;
  }
  function collectMap(o,ent,ind){
    const v=ent.v;
    if(v!=='' && v!==undefined && v!==null){ o[ent.k]=/^[{[]/.test(trimStr(v))?parseFlow(trimStr(v)):parseScalar(v); return; }
    if(i<lines.length && lines[i].ind>ind){ o[ent.k]=parseNode(lines[i].ind); return; }
    if(i<lines.length && lines[i].ind===ind && /^-(\s|$)/.test(lines[i].txt)){ o[ent.k]=parseSeq(ind); return; }
    o[ent.k]=null;
  }
  return parseNode(lines[0].ind);
}
/* ================= YAML 序列化 ================= */
function yq(v){
  if(typeof v==='number'||typeof v==='boolean') return String(v);
  if(v===null||v===undefined) return 'null';
  const s=String(v);
  if(s==='') return '""';
  if(/^[\s>|@`&*!%#,?:\[\]{}\-]/.test(s)||/:\s/.test(s)||/\s#/.test(s)||/[\n"']/.test(s)||
     /^\s|\s$/.test(s)||['true','false','null','yes','no','on','off','~'].includes(s.toLowerCase())||
     /^-?[\d.]+$/.test(s)||/^[0-9a-fA-F]{2,16}$/.test(s))
    return '"'+s.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n')+'"';
  return s;
}
function yamlLines(v,ind){
  const pad='  '.repeat(ind), out=[];
  if(Array.isArray(v)){
    if(!v.length) return [pad+'[]'];
    for(const it of v){
      if(it&&typeof it==='object'&&(Array.isArray(it)?it.length:Object.keys(it).length)){
        const sub=yamlLines(it,ind+1);
        out.push(pad+'- '+sub[0].slice(pad.length+2));
        for(let k=1;k<sub.length;k++) out.push(pad+'  '+sub[k].slice(pad.length+2));
      } else out.push(pad+'- '+yq(it));
    }
    return out;
  }
  for(const [k,val] of Object.entries(v)){
    if(val===undefined) continue;
    const isArr=Array.isArray(val), isObj=val&&typeof val==='object'&&!isArr;
    if((isArr&&val.length)||(isObj&&Object.keys(val).length)){ out.push(pad+k+':'); out.push(...yamlLines(val,ind+1)); }
    else if(isArr) out.push(pad+k+': []');
    else if(isObj) out.push(pad+k+': {}');
    else out.push(pad+k+': '+yq(val));
  }
  return out;
}
function dumpYAML(o){ return yamlLines(o,0).join('\n')+'\n'; }
function clean(o){
  if(Array.isArray(o)) return o.map(clean).filter(v=>v!==null);
  if(o&&typeof o==='object'){
    const r={};
    for(const [k,v] of Object.entries(o)){
      if(v===null||v===undefined||v==='') continue;
      if(Array.isArray(v)&&!v.length) continue;
      const c=clean(v);
      if(c&&typeof c==='object'&&!Array.isArray(c)&&!Object.keys(c).length) continue;
      r[k]=c;
    }
    return r;
  }
  return o;
}

/* ================= URI → Node ================= */
function fragName(f){
  if(!f) return '';
  let s=String(f).split('?')[0].split('&')[0];
  try{ s=decodeURIComponent(s.replace(/\+/g,' ')); }catch(e){}
  return s.trim();
}
function parseURI(uri){
  uri=trimStr(uri);
  const m=/^([a-zA-Z0-9+.-]+):\/\/(.*)$/.exec(uri);
  if(!m) return null;
  const scheme=m[1].toLowerCase();
  let rest=m[2], frag='', query='';
  const hi=rest.indexOf('#');
  if(hi>=0){ frag=rest.slice(hi+1); rest=rest.slice(0,hi); }
  const qi=rest.indexOf('?');
  if(qi>=0){ query=rest.slice(qi+1); rest=rest.slice(0,qi); }
  const p=qs2obj(query);
  const name=fragName(frag)||fragName(p.remarks)||fragName(p.name)||fragName(p.ps)||fragName(p.tag)||'';
  const at=rest.lastIndexOf('@');
  const credStr=at>=0?rest.slice(0,at):'';
  const [server,port]=splitHostPort(at>=0?rest.slice(at+1):rest,443);
  const arr=v=>Array.isArray(v)?v:(v?String(v).split(','):null);
  const n={protocol:scheme, name:name||scheme.toUpperCase(), server, port,
    uuid:'', password:'', alterId:0, cipher:'', network:'tcp', security:'none',
    sni:'', host:'', path:'', alpn:null, fingerprint:'', insecure:false,
    flow:'', reality:null, obfsType:'', obfsPassword:'', grpcServiceName:'',
    plugin:'', method:'', raw:uri};

  try{
    if(scheme==='vmess'){
      const d=JSON.parse(b64d(rest));
      if(!d||!d.add) return null;
      return Object.assign(n,{
        protocol:'vmess', name:name||d.ps||d.name||'VMess',
        server:d.add, port:+d.port||443, uuid:d.id||'', alterId:+d.aid||0,
        cipher:d.scy||'auto', security:d.tls||'none', network:d.net||'tcp',
        sni:d.sni||d.host||'', host:d.host||'', path:d.path||'',
        alpn:arr(d.alpn), fingerprint:d.fp||'',
        insecure:+(d.allowInsecure||0)===1,
        reality:d.pbk?{public_key:d.pbk, short_id:String(d.sid||''), spx:d.spx||''}:null,
        grpcServiceName:d.serviceName||''});
    }
    if(scheme==='vless'){
      const sec=p.security||'none';
      n.protocol='vless'; n.name=name||'VLESS';
      n.uuid=credStr; n.network=p.type||'tcp'; n.security=sec;
      n.flow=p.flow||''; n.encryption=p.encryption||'none';
      n.sni=p.sni||p.servername||''; n.host=p.host||''; n.path=p.path||'';
      n.alpn=arr(p.alpn); n.fingerprint=p.fp||'';
      n.insecure=+(p.allowInsecure||p.insecure||0)===1;
      n.grpcServiceName=p.serviceName||p.service_name||'';
      n.reality=sec==='reality'?{public_key:p.pbk||'', short_id:String(p.sid||''), spx:p.spx||''}:null;
      n.udp=p.udp!=='false';
      return n;
    }
    if(scheme==='trojan'){
      n.protocol='trojan'; n.name=name||'Trojan';
      n.password=decodeURIComponent(credStr.split(':')[0]||'');
      n.security=p.security||'tls'; n.network=p.type||'tcp';
      n.sni=p.sni||p.peer||server; n.host=p.host||''; n.path=p.path||'';
      n.alpn=arr(p.alpn); n.fingerprint=p.fp||'';
      n.insecure=+(p.allowInsecure||0)===1;
      n.grpcServiceName=p.serviceName||'';
      if(p.security==='reality') n.reality={public_key:p.pbk||'', short_id:String(p.sid||''), spx:p.spx||''};
      return n;
    }
    if(scheme==='ss'||scheme==='shadowsocks'){
      n.protocol='ss'; n.name=name||'Shadowsocks';
      let info=rest, srv=server, pt=port||8388, nm=n.name;
      if(!info.includes('@')){
        let b64=info;
        try{ b64=decodeURIComponent(info); }catch(e){}
        const dec=b64d(b64);
        if(dec){
          let payload=dec, frag2='';
          const h=dec.indexOf('#');
          if(h>=0){ payload=dec.slice(0,h); frag2=fragName(dec.slice(h+1)); }
          const a2=payload.lastIndexOf('@');
          if(a2>=0){
            const mp=payload.slice(0,a2);
            const sp=splitHostPort(payload.slice(a2+1),8388);
            srv=sp[0]; pt=sp[1];
            const ci=mp.indexOf(':');
            n.method=ci>=0?mp.slice(0,ci):mp; n.password=ci>=0?mp.slice(ci+1):'';
            n.server=srv; n.port=pt;
            if(frag2) n.name=frag2;
            n.plugin=p.plugin||''; n.obfsParams=p['plugin-opts']||'';
            return n;
          }
        }
      }
      const ci=credStr.indexOf(':');
      n.method=ci>=0?credStr.slice(0,ci):credStr;
      n.password=ci>=0?decodeURIComponent(credStr.slice(ci+1)):'';
      if(!n.server) n.server=server;
      n.plugin=p.plugin||''; n.obfsParams=p['plugin-opts']||'';
      return n;
    }
    if(scheme==='ssr'){
      let main=rest, fr='';
      const h=main.indexOf('#'); if(h>=0){ fr=main.slice(h+1); main=main.slice(0,h); }
      const q=main.indexOf('/?'); const pp=qs2obj(q>=0?main.slice(q+2):'');
      if(q>=0) main=main.slice(0,q);
      main=main.replace(/[-_]/g,c=>c==='-'?'+':'/');
      const dec=b64d(main); if(!dec) return null;
      const seg=dec.split(':');
      const sp=splitHostPort(seg[0]||'',8388);
      n.protocol='ssr'; n.name=name||frName(fr)||'SSR';
      n.server=sp[0]; n.port=sp[1]; n.method=seg[3]||'chacha20';
      n.password=decodeURIComponent(seg[4]||'');
      n.obfsType=seg[5]||'plain'; n.protocolParam=decodeURIComponent(seg[6]||'');
      n.obfsPassword=decodeURIComponent(seg[7]||'');
      return n;
      function frName(f){ return fragName(f); }
    }
    if(scheme==='hysteria'||scheme==='hysteria2'||scheme==='hy2'){
      n.protocol='hysteria2'; n.name=name||'Hysteria2';
      n.password=decodeURIComponent(credStr.split(':')[0]||'');
      n.sni=p.sni||p.peer||server; n.security='tls';
      n.alpn=arr(p.alpn)||['h3'];
      n.insecure=+(p.insecure||0)===1;
      n.obfsType=p.obfs||''; n.obfsPassword=p['obfs-password']||'';
      n.down=p.downmbps||p.down||''; n.up=p.upmbps||p.up||'';
      n.disableMTUDiscovery=p.disable_mtu_discovery==='1';
      n.fastOpen=p.fastopen==='1';
      return n;
    }
    if(scheme==='tuic'){
      n.protocol='tuic'; n.name=name||'TUIC';
      const ci=credStr.indexOf(':');
      n.uuid=ci>=0?credStr.slice(0,ci):credStr;
      n.password=ci>=0?decodeURIComponent(credStr.slice(ci+1)):'';
      n.sni=p.sni||server; n.alpn=arr(p.alpn)||['h3']; n.security='tls';
      n.congestionControl=p.congestion_control||p.cc||'cubic';
      n.udpRelayMode=p.udp_relay_mode||'native';
      n.insecure=+(p.allow_insecure||p.allowInsecure||0)===1;
      n.disableSNI=+(p.disable_sni||0)===1;
      return n;
    }
    if(scheme==='wireguard'||scheme==='wg'){
      n.protocol='wireguard'; n.name=name||'WireGuard';
      n.privateKey=decodeURIComponent(credStr);
      n.peerPublicKey=p.publickey||p.public_key||'';
      n.preSharedKey=p.preshared_key||'';
      n.localAddress=(p.address||p.allowedips||'10.0.0.2/32').split(',').map(s=>s.trim());
      n.mtu=+p.mtu||1420;
      n.reserved=String(p.reserved||'').split(',').map(s=>s.trim()).filter(x=>x!=='').map(Number);
      n.persistentKeepalive=+p.keepalive||0;
      n.port=port||51820;
      return n;
    }
    if(scheme==='anytls'){
      n.protocol='anytls'; n.name=name||'AnyTLS';
      n.password=decodeURIComponent(credStr.split(':')[0]||'');
      n.sni=p.sni||server; n.security='tls';
      n.alpn=arr(p.alpn)||['h2','http/1.1'];
      n.insecure=+(p.allowinsecure||p.allowInsecure||0)===1;
      n.fingerprint=p.fp||''; n.path=p.path||'';
      return n;
    }
    if(scheme==='socks'||scheme==='socks5'||scheme==='http'||scheme==='https'){
      n.protocol=scheme.startsWith('socks')?'socks5':'http';
      n.name=name||(n.protocol==='socks5'?'Socks5':'HTTP');
      const ci=credStr.indexOf(':');
      n.username=ci>=0?decodeURIComponent(credStr.slice(0,ci)):'';
      n.password=ci>=0?decodeURIComponent(credStr.slice(ci+1)):'';
      n.tls=scheme==='https'; n.security=scheme==='https'?'tls':'none';
      return n;
    }
  }catch(e){ console.warn('URI parse fail:',uri,e); }
  return null;
}

/* ================= Surge CONF → Node ================= */
function surgeSections(text){
  const res={}; let cur=null;
  String(text).split(/\r?\n/).forEach(l=>{
    const m=/^\[(.+?)\]/.exec(l.trim());
    if(m){ cur=m[1].trim(); res[cur]=res[cur]||[]; return; }
    if(cur!==null&&l.trim()) res[cur].push(l);
  });
  return res;
}
function baseNode(proto,name,server,port){
  return {protocol:proto, name:name, server:String(server||''), port:+port||443,
    uuid:'', password:'', alterId:0, cipher:'', method:'', network:'tcp', security:'none',
    sni:'', host:'', path:'', alpn:null, fingerprint:'', insecure:false, flow:'', reality:null,
    obfsType:'', obfsPassword:'', grpcServiceName:'', plugin:'', udp:true, raw:null};
}
function surgeLine(l){
  const s=trimStr(l);
  if(!s||/^[;#]/.test(s)||s[0]==='[') return null;
  const i=s.indexOf('='); if(i<0) return null;
  const name=s.slice(0,i).trim().replace(/^"|"$/g,'');
  let parts=splitComma(s.slice(i+1));
  let type=(parts[0]||'').trim().toLowerCase();
  let server=parts[1], port=parts[2];
  // Surge: NAME = external, host, port, <realtype>, key=value...
  if(type==='external'){ type=(parts[3]||'').trim().toLowerCase(); parts=parts.slice(0,3).concat(parts.slice(4)); }
  const kv={};
  parts.slice(3).forEach(x=>{ const j=x.indexOf('=');
    if(j>0) kv[x.slice(0,j).trim().toLowerCase()]=x.slice(j+1).trim().replace(/^"|"$/g,''); });
  const bool=v=>v==='true'||v==='1'||v==='yes';
  try{
    if(type==='vmess'&&server){
      const n=baseNode('vmess',name,server,port||443);
      n.uuid=kv.username||kv.password||''; n.alterId=+kv['alter-id']||0;
      n.cipher=kv['vmess-mode']||'auto';
      if(bool(kv.tls)||bool(kv['over-tls'])){ n.security='tls'; n.sni=kv.sni||kv['obfs-host']||server; }
      if(bool(kv.ws)||type==='ws'){ n.network='ws'; n.path=kv['ws-path']||'/'; n.host=kv['ws-host']||kv['obfs-host']||''; }
      if(!n.name) n.name='VMess';
      return n;
    }
    if(type==='vless'&&server){
      const n=baseNode('vless',name,server,port||443);
      n.uuid=kv.username||'';
      if(bool(kv['reality'])) n.security='reality'; else if(bool(kv.tls)) n.security='tls';
      n.sni=kv.sni||kv['tls-hosting']||kv['tls-host']||server;
      if(n.security==='reality') n.reality={public_key:kv['reality-public-key']||'', short_id:String(kv['reality-short-id']||''), spx:''};
      n.flow=kv['flow']||'';
      if(bool(kv.ws)){ n.network='ws'; n.path=kv['ws-path']||'/'; n.host=kv['ws-host']||''; }
      if(bool(kv['tcp-obsolete-header'])) n.network='tcp';
      return n;
    }
    if(type==='trojan'&&server){
      const n=baseNode('trojan',name,server,port||443);
      n.password=kv.password||''; n.security='tls';
      n.sni=kv.sni||kv['tls-host']||server; n.alpn=kv.alpn?String(kv.alpn).split(','):['http/1.1'];
      if(bool(kv['tls-pinning'])||bool(kv['skip-cert-verify'])||kv['tls-verification']==='skip') n.insecure=true;
      if(bool(kv.ws)){ n.network='ws'; n.path=kv['ws-path']||'/'; n.host=kv['ws-host']||''; }
      if(bool(kv['reality'])){ n.security='reality'; n.reality={public_key:kv['reality-public-key']||'', short_id:String(kv['reality-short-id']||''), spx:''}; }
      return n;
    }
    if((type==='ss'||type==='shadowsocks'||type==='custom')&&server){
      const n=baseNode('ss',name,server,port||8388);
      n.method=kv['encrypt-method']||'aes-256-gcm'; n.password=kv.password||'';
      if(kv.obfs&&kv.obfs!=='plain'){ n.plugin=kv.obfs; n.obfsParams='mode='+(kv['obfs-mode']||'')+(kv['obfs-host']?';host='+kv['obfs-host']:''); }
      n.udp=bool(kv['udp-relay'])||kv['udp-relay']===undefined;
      return n;
    }
    if(type==='ssr'&&server){
      const n=baseNode('ssr',name,server,port||8388);
      n.method=kv.method||'aes-256-cfb'; n.password=kv.password||'';
      n.protocolParam=kv.protocol||'origin'; n.obfsType=kv.obfs||'plain'; n.obfsPassword=kv['obfs-param']||'';
      return n;
    }
    if((type==='hysteria2'||type==='hysteria'||type==='hy2')&&server){
      const n=baseNode('hysteria2',name,server,port||443);
      n.password=kv.password||''; n.security='tls'; n.sni=kv.sni||server;
      n.alpn=['h3']; n.insecure=bool(kv['skip-cert-verify']);
      if(kv.obfs&&kv.obfs!=='none') n.obfsType=kv.obfs;
      n.obfsPassword=kv['obfs-param']||'';
      return n;
    }
    if(type==='tuic'&&server){
      const n=baseNode('tuic',name,server,port||443);
      n.uuid=kv.token||kv.password||''; n.password=kv.password||'';
      n.security='tls'; n.sni=kv.sni||server; n.alpn=kv.alpn?String(kv.alpn).split(','):['h3'];
      n.congestionControl=kv['congestion-controller']||'cubic';
      n.udpRelayMode=kv['udp-relay-mode']||'native';
      n.insecure=bool(kv['skip-cert-verify']);
      return n;
    }
    if(type==='wireguard'&&server){
      const n=baseNode('wireguard',name,server,port||51820);
      n.peerPublicKey=kv['public-key']||''; n.privateKey=kv['private-key']||'';
      n.preSharedKey=kv['pre-shared-key']||'';
      n.localAddress=(kv.ip?String(kv.ip).split(','):[]).map(x=>x.includes('/')?x:x+'/32');
      n.mtu=+kv.mtu||1428;
      return n;
    }
    if((type==='any-tls'||type==='anytls')&&server){
      const n=baseNode('anytls',name,server,port||443);
      n.password=kv.password||''; n.security='tls'; n.sni=kv.sni||server;
      n.alpn=kv.alpn?String(kv.alpn).split(','):['h2','http/1.1'];
      n.insecure=bool(kv['skip-cert-verify']);
      return n;
    }
    if((type==='socks5'||type==='socks5-tls'||type==='http'||type==='https')&&server){
      const isHttp=type==='http'||type==='https';
      const n=baseNode(isHttp?'http':'socks5',name,server,port||(isHttp?80:1080));
      n.username=kv.username||''; n.password=kv.password||'';
      if(type==='socks5-tls'||type==='https'){ n.security='tls'; n.sni=kv.sni||server; }
      return n;
    }
  }catch(e){ console.warn('surge line fail:',l,e); }
  return null;
}

/* ============ 节点名标注：出口地址 / 复用检测 ============ */
/* 目的：一眼看出哪些节点其实连的是同一台机器（同 server:port）。
   规则：
   - 改名一律在 applyGrouping 之前做，且返回【新对象】，绝不改写 ALL 里的原节点；
   - 原名存进 n._orig，detectRegion / baseName 优先读 _orig，避免 IP、端口、.ru 之类
     字符串被地区正则误判成分组依据；
   - 复用次数按当前整份解析结果统计；若以后加筛选，再在筛选前保存全量节点计数。 */

const NAMETAG = { mode:'off', markDup:false, ipReady:false };
let _dohCache = null;

const DOH_TTL = 21600;            // 解析结果缓存 6 小时
const DOH_SERVERS = [
  'https://dns.alidns.com/resolve?name=',   // 国内可达 + CORS=*
  'https://doh.pub/resolve?name=',
  'https://cloudflare-dns.com/dns-query?name='
];

/* IPv4 / IPv6 字面量不再解析 */
function isIpLiteral(h){
  const s=String(h||'').replace(/^\[|\]$/g,'');
  if(/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return true;
  if(/^[0-9a-f:]+$/i.test(s) && s.indexOf(':')>=0) return true;
  return false;
}

/* localStorage 里的 DoH 缓存（惰性加载） */
function dohCache(){
  if(_dohCache) return _dohCache;
  try{ _dohCache = JSON.parse(localStorage.getItem('subconv_doh')||'{}'); }
  catch(e){ _dohCache = {}; }
  if(!_dohCache || typeof _dohCache!=='object') _dohCache={};
  return _dohCache;
}
function dohCacheSave(){
  try{ localStorage.setItem('subconv_doh', JSON.stringify(dohCache())); }catch(e){}
}
function dohCached(host){
  const e=dohCache()[host];
  if(e && e.ip && (Date.now()-(e.t||0)) < DOH_TTL*1000) return e.ip;
  return null;
}

/* 单个域名 → IPv4。逐个候选源尝试，任一成功即缓存。 */
async function resolveOne(host){
  if(isIpLiteral(host)) return host;
  const hit=dohCached(host);
  if(hit) return hit;
  for(const base of DOH_SERVERS){
    try{
      const r = await fetch(base+encodeURIComponent(host)+'&type=A',
        { headers:{ 'Accept':'application/dns-json' }, cache:'default' });
      if(!r.ok) continue;
      const j = await r.json();
      const ans=(j.Answer||[]).filter(a=>a&&a.type===1&&a.data).map(a=>a.data);
      if(ans.length){
        const ip=ans[0];
        dohCache()[host]={ip:ip,t:Date.now()};
        // 缓存过大时按时间淘汰，避免 localStorage 撑爆
        const keys=Object.keys(dohCache());
        if(keys.length>400){
          keys.sort((a,b)=>(dohCache()[a].t||0)-(dohCache()[b].t||0))
              .slice(0, keys.length-400).forEach(k=>delete dohCache()[k]);
        }
        dohCacheSave();
        return ip;
      }
    }catch(e){ /* 换下一个源 */ }
  }
  return null;
}

/* 批量解析（并发≤8，每个请求之间留一点间隔，别把公共 DoH 打爆） */
async function resolveHosts(hosts){
  const uniq=[...new Set(hosts.filter(h=>h && !isIpLiteral(h)))];
  const out={};
  uniq.filter(isIpLiteral).forEach(h=>{ out[h]=h; });
  const pending=uniq.filter(h=>{ const c=dohCached(h); if(c){ out[h]=c; return false; } return true; });
  const CONC=8, GAP=120;
  let i=0;
  async function worker(){
    while(i<pending.length){
      const h=pending[i++];
      out[h]=await resolveOne(h);
      await new Promise(r=>setTimeout(r,GAP));
    }
  }
  const workers=[];
  for(let k=0;k<Math.min(CONC,pending.length);k++) workers.push(worker());
  await Promise.all(workers);
  // 已是 IP 字面量的直接回填
  hosts.filter(h=>h&&isIpLiteral(h)).forEach(h=>{ if(!out[h]) out[h]=h; });
  return out;
}

/* 端点标识：判断“是不是同一台机器”的依据 */
function endpointKey(n, ipMap){
  let host=String(n.server||'');
  if(NAMETAG.mode==='ip' && ipMap){
    const got=ipMap[host];
    if(got) host=got;
  }
  const p=n.port?String(n.port):'';
  return p ? host+':'+p : host;
}

/* 聚合键：协议 + 端点。跨协议同端口不算复用。
   注意必须用 n.protocol —— 解析器把协议写在 protocol 字段上，节点对象没有 type 字段；
   早先用 n.type 会让协议恒为 undefined，导致「ss:443」和「trojan:443」被错误合并成复用。 */
function aggKey(n, ipMap){
  const proto=String(n.protocol||n.type||'?').toLowerCase();
  return proto+'|'+endpointKey(n, ipMap);
}

/* 统计整份订阅里每个端点被多少节点使用 */
function endpointCounts(list, ipMap){
  const m=Object.create(null);
  for(const n of list){
    const k=aggKey(n, ipMap);
    m[k]=(m[k]||0)+1;
  }
  return m;
}

/* 后缀文本。mode=off 且未开重复标注时返回 ''（即不改名）。
   counts 可由调用方传入（删减功能传母本全量计数，避免名字随筛选漂移）。 */
function tagSuffix(n, counts, ipMap){
  const parts=[];
  if(NAMETAG.mode!=='off'){
    let host=String(n.server||'');
    if(NAMETAG.mode==='ip'){
      const got=(ipMap&&ipMap[host])||dohCached(host)||'';
      host=got||('解析失败:'+host);
    }
    parts.push(NAMETAG.mode==='port' ? String(n.port||'') : (host+':'+(n.port||'')));
  }
  if(NAMETAG.markDup){
    const c=(counts||Object.create(null))[aggKey(n, ipMap)]||1;
    parts.push(c>1 ? ('复用'+c) : '独占');
  }
  if(!parts.length) return '';
  return '【'+parts.join(' ')+'】';
}

/* 应用改名：返回新数组/新对象，原数组保持干净 */
function tagNodes(list, ipMap, counts){
  if(NAMETAG.mode==='off' && !NAMETAG.markDup) return list;
  const cts=counts||endpointCounts(list, ipMap);
  return list.map(n=>{
    const sfx=tagSuffix(n, cts, ipMap);
    if(!sfx) return n;
    const orig=String(n._orig||n.name||'');
    const c=Object.assign({}, n, { _orig:orig, name:orig+sfx });
    return c;
  });
}

/* 列出复用端点（同一协议+端点被 ≥2 个节点使用），用于面板说明 */
function dupReport(list, ipMap){
  const g=Object.create(null);
  for(const n of list){
    const k=aggKey(n, ipMap);
    (g[k]=g[k]||[]).push(String(n._orig||n.name||''));
  }
  return Object.entries(g).filter(([,v])=>v.length>1)
    .map(([k,v])=>({ key:k, type:k.split('|')[0], endpoint:k.split('|').slice(1).join('|'), names:v }))
    .sort((a,b)=>b.names.length-a.names.length);
}

function applyNameTagsInPlace(){
  if(!Array.isArray(NODES) || !NODES.length) return;
  NODES.forEach(n=>{ if(!n._orig) n._orig=String(n.name||''); n.name=String(n._orig||n.name||''); });
  const tagged=tagNodes(NODES, NAMETAG.ipMap);
  if(tagged!==NODES) NODES.splice(0,NODES.length,...tagged);
}
function refreshNameTags(){
  if(!Array.isArray(NODES) || !NODES.length) return;
  /* 有母本时走「筛选→标注」管线，复用计数保持基于全量；否则退回旧行为 */
  if(Array.isArray(MASTER) && MASTER.length){ runFilter(); return; }
  applyNameTagsInPlace();
  showNodes();
  const msg=$('msg');
  if(msg){
    const d=dupReport(NODES, NAMETAG.ipMap);
    msg.className=d.length?'msg warn':'msg ok';
    msg.textContent=d.length ? ('已刷新标注；发现 '+d.length+' 个复用入口，最大复用 '+Math.max(...d.map(x=>x.names.length))+' 个节点') : '已刷新节点名标注，未发现同端点复用';
  }
}
async function resolveNodeIPs(btn){
  if(!Array.isArray(NODES) || !NODES.length){ const m=$('msg'); if(m){m.className='msg warn';m.textContent='请先解析订阅';} return; }
  const old=btn?btn.textContent:''; if(btn){btn.disabled=true;btn.textContent='解析中…';}
  const m=$('msg'); if(m){m.className='msg';m.textContent='正在解析 '+new Set(NODES.map(n=>n.server).filter(Boolean)).size+' 个域名/IP…';}
  try{
    NAMETAG.ipMap=await resolveHosts(NODES.map(n=>String(n.server||'')));
    NAMETAG.ipReady=true;
    NAMETAG.mode='ip';
    NAMETAG.markDup=true;
    document.querySelectorAll('#nametag-mode .choice').forEach(x=>{const on=x.dataset.nt==='ip';x.classList.toggle('on',on);x.setAttribute('aria-pressed',String(on));});
    refreshNameTags();
  }catch(e){ if(m){m.className='msg err';m.textContent='解析 IP 失败：'+e.message;} }
  finally{ if(btn){btn.disabled=false;btn.textContent=old;} }
}

/* ============ 节点删减：手动隐藏 / 规则删除 / 复用去重 ============ */
/* 设计约定（改动前请先读）：
   - MASTER 是「解析完成、尚未标注」的母本列表；删减和标注都从它派生，
     这样反复切换筛选条件不会丢节点，也不会让名字越改越长。
   - 复用计数一律基于 MASTER 统计。因为「几个节点名指向同一台机器」是机场的
     客观属性，如果基于当前列表统计，用户删掉 4 个之后剩下那个会从「复用5」
     变成「独占」，名字随筛选漂移。
   - 三档规则叠加，优先级：手动隐藏 > 复用去重 > 关键词规则。
   - 节点稳定标识用 protocol|server|port|原名（nodeKey）。不能用 name，因为
     标注会改写 name；也不能只用 server:port，因为同端点有多个节点名。 */

const FILTER = { hidden:Object.create(null), kw:'', dropDup:false };
let MASTER = [];
let FILTER_APPLIED = { kept:[], removed:[], groups:[] };
let FILTER_SCOPE = 'mem';

/* 节点唯一键（含原名，机场改名后需重新删，UI 已提示） */
function nodeKey(n){
  return [String(n.protocol||'?'), String(n.server||''), String(n.port||''), String(n._orig||n.name||'')].join('\u0001');
}
function strHash(s){
  let h=5381; const x=String(s||'');
  for(let i=0;i<x.length;i++) h=(((h<<5)+h)+x.charCodeAt(i))>>>0;
  return h.toString(36);
}

/* ---------- 关键词规则 ----------
   单个词命中即删（OR）；`!` 前缀为排除，命中排除词的节点不删。
     hk              名字包含 hk
     type:hysteria2  按协议（别名 hy2/hysteria 同义）
     port:34567      按端口
     re/^🇭🇰/         正则（第二个 / 后可加 i 等标志）
     纯 `!hk`        不触发删除（只作为其他规则的豁免） */
const PROTO_ALIAS={hy2:'hysteria2',hysteria:'hysteria2',ssr:'ssr',shadowsocks:'ss',v2ray:'vmess'};
function normProto(p){ const s=String(p||'').toLowerCase(); return PROTO_ALIAS[s]||s; }

function parseKwRules(s){
  const out={name:[],not:[],types:[],notTypes:[],ports:[],notPorts:[],re:[],notRe:[]};
  String(s||'').split(/[\s,，、;；]+/).filter(Boolean).forEach(tk=>{
    const neg=/^[!！]/.test(tk), x=tk.replace(/^[!！]/,'');
    if(!x) return;
    let m;
    if((m=/^(?:type|proto|协议)[:：](.*)$/i.exec(x))){ const v=normProto(m[1]); if(v)(neg?out.notTypes:out.types).push(v); return; }
    if((m=/^(?:port|端口)[:：](\d+)$/.exec(x))){ const v=+m[1]; if(v)(neg?out.notPorts:out.ports).push(v); return; }
    if((m=/^re\/(.+)\/([a-z]*)$/i.exec(x))){ try{const r=new RegExp(m[1],m[2]);(neg?out.notRe:out.re).push(r);}catch(e){} return; }
    /* 裸数字：多数人想按端口删，同时也匹配名字（如「0.1x」「1倍率」）。
       两者取并集，符合直觉；要只匹配名字请用 re/^443$/。 */
    if(/^\d+$/.test(x)){ const v=+x; if(v && !neg) out.ports.push(v); }
    (neg?out.not:out.name).push(x.toLowerCase());
  });
  out.active=!!(out.name.length||out.types.length||out.ports.length||out.re.length);
  return out;
}

/* 返回命中的类别数组（空=未命中；豁免则返回 null），供展示时说明「为什么删」 */
function ruleHits(n, r){
  const raw=String(n._orig||n.name||'');
  const low=raw.toLowerCase(), proto=normProto(n.protocol), port=+n.port||0;
  const hits=[];
  if(r.name.some(k=>low.indexOf(k)>=0)) hits.push('关键词');
  if(r.types.some(t=>proto===t))        hits.push('协议');
  if(r.ports.some(p=>port===p))         hits.push('端口');
  if(r.re.some(x=>{ try{return x.test(raw);}catch(e){return false;} })) hits.push('正则');
  if(!hits.length) return null;
  const exempt=r.not.some(k=>low.indexOf(k)>=0)
            || r.notTypes.some(t=>proto===t)
            || r.notPorts.some(p=>port===p)
            || r.notRe.some(x=>{ try{return x.test(raw);}catch(e){return false;} });
  return exempt ? null : hits;
}

/* ---------- 主流程：母本 → 筛选 → 标注 → NODES ---------- */
function applyFilters(master, counts){
  const hidden=FILTER.hidden, kw=parseKwRules(FILTER.kw), ipMap=NAMETAG.ipMap;
  const kept=[], removed=[];
  /* 复用组代表：隐藏后组内第一个存活的节点，保证结果稳定可预期 */
  const rep=Object.create(null);
  if(FILTER.dropDup){
    for(const n of master){
      if(hidden[nodeKey(n)]) continue;
      const k=aggKey(n, ipMap);
      if(counts[k]>1 && !rep[k]) rep[k]=nodeKey(n);
    }
  }
  for(const n of master){
    const k=nodeKey(n), ak=aggKey(n, ipMap);
    if(hidden[k]){ removed.push({node:n, kind:'手动', why:'手动'}); continue; }
    if(FILTER.dropDup && counts[ak]>1 && rep[ak]!==k){ removed.push({node:n, kind:'复用去重', why:'复用去重'}); continue; }
    if(kw.active){ const hs=ruleHits(n, kw);
      if(hs){ removed.push({node:n, kind:'关键词', why:hs.join('+')}); continue; } }
    kept.push(n);
  }
  return {kept, removed, groups:dupReport(master, ipMap)};
}

function applyFilterAndTags(){
  if(!Array.isArray(MASTER) || !MASTER.length){
    NODES.length=0; FILTER_APPLIED={kept:[],removed:[],groups:[]}; return;
  }
  const counts=endpointCounts(MASTER, NAMETAG.ipMap);
  FILTER_APPLIED=applyFilters(MASTER, counts);
  const tagged=tagNodes(FILTER_APPLIED.kept, NAMETAG.ipMap, counts);
  NODES.length=0;
  Array.prototype.push.apply(NODES, tagged);
}

/* ---------- 持久化：按「输入来源」存，换订阅不会串味 ---------- */
function currentTab(){
  try{ const el=document.querySelector('.tab.on'); return (el&&el.dataset&&el.dataset.t)||'url'; }catch(e){ return 'url'; }
}
function filterScopeId(){
  const tab=currentTab();
  try{
    if(tab==='url'){ const v=String(($('i-url')&&$('i-url').value)||'').trim(); if(v) return 'url:'+v; }
    if(tab==='file'){ const f=$('i-file')&&$('i-file').files&&$('i-file').files[0]; if(f) return 'file:'+f.name+':'+(f.size||0); }
    if(tab==='text'){ const v=String(($('i-text')&&$('i-text').value)||''); if(v.trim()) return 'txt:'+strHash(v.length+'#'+v.slice(0,65536)); }
  }catch(e){}
  return 'mem';
}
function filterStoreKey(){ return 'subconv_filter::'+strHash(FILTER_SCOPE); }
function filterSave(){
  FILTER_SCOPE=filterScopeId();
  if(FILTER_SCOPE==='mem') return;              /* 粘贴/文件内容无稳定标识，只在本次会话生效 */
  try{
    localStorage.setItem(filterStoreKey(), JSON.stringify({
      v:1, kw:FILTER.kw, dropDup:!!FILTER.dropDup, hidden:Object.keys(FILTER.hidden)
    }));
  }catch(e){}
}
function filterLoad(scope){
  FILTER_SCOPE=scope||filterScopeId();
  FILTER.hidden=Object.create(null); FILTER.kw=''; FILTER.dropDup=false;
  if(FILTER_SCOPE==='mem') return false;
  try{
    const j=JSON.parse(localStorage.getItem(filterStoreKey())||'null');
    if(!j||typeof j!=='object') return false;
    FILTER.kw=String(j.kw||''); FILTER.dropDup=!!j.dropDup;
    (Array.isArray(j.hidden)?j.hidden:[]).forEach(k=>{ FILTER.hidden[k]=1; });
    return true;
  }catch(e){ return false; }
}

/* ---------- UI ---------- */
function filterSummary(){
  const t=MASTER.length, k=FILTER_APPLIED.kept.length||0, d=t-k;
  const parts=['母本 '+t, '生效 '+k];
  if(d) parts.push('已删 '+d);
  const manual=FILTER_APPLIED.removed.filter(x=>x.kind==='手动').length;
  const dup=FILTER_APPLIED.removed.filter(x=>x.kind==='复用去重').length;
  const kw=FILTER_APPLIED.removed.filter(x=>x.kind==='关键词').length;
  if(manual) parts.push('手动 '+manual);
  if(dup) parts.push('复用去重 '+dup);
  if(kw) parts.push('关键词 '+kw);
  return parts.join(' · ');
}

function renderFilterPanels(){
  const box=$('f-removed');
  if(box){
    const rs=FILTER_APPLIED.removed||[];
    box.style.display=rs.length?'block':'none';
    box.innerHTML='<b>被删除的节点（点 ↺ 恢复）</b>'+rs.slice(0,200).map((x,i)=>
      '<div class="f-row"><span class="f-nm">'+esc(String(x.node._orig||x.node.name||''))+
      '</span><span class="f-ad">'+esc(x.node.protocol)+' · '+esc(x.node.server)+':'+esc(x.node.port)+'</span>'+
      '<span class="f-why">'+esc(x.why)+'</span>'+
      '<button type="button" class="node-x" title="恢复" onclick="restoreRemoved('+i+')">↺</button></div>').join('')+
      (rs.length>200?'<div class="f-more">…另有 '+(rs.length-200)+' 个未列出</div>':'');
  }
  const gb=$('f-groups');
  if(gb){
    const gs=FILTER_APPLIED.groups||[];
    gb.style.display=gs.length?'block':'none';
    if(gs.length){
      /* 按「当前存活数」给按钮标数字：母本成员可能已被手动删除，
         用 names.length-1 会承诺一个做不到的数字。 */
      const keptCnt=Object.create(null);
      for(const n of (FILTER_APPLIED.kept||[])){ const k=aggKey(n, NAMETAG.ipMap); keptCnt[k]=(keptCnt[k]||0)+1; }
      gb.innerHTML='<b>复用入口（同协议 + 同地址端口）</b>'+gs.map((g,i)=>{
        const alive=keptCnt[g.type+'|'+g.endpoint]||0;
        const btn=alive>1
          ? '<button type="button" class="node-x" title="该组只留第一个存活节点，其余隐藏" onclick="hideGroupExtra('+i+')">留1删'+(alive-1)+'</button>'
          : '<span class="f-why">已无多余</span>';
        return '<div class="f-row"><span class="f-ad">'+esc(g.type)+' · '+esc(g.endpoint)+'</span>'+
               '<span class="f-nm">'+esc(g.names.join(' / '))+'</span>'+btn+'</div>';
      }).join('');
    }
  }
  const st=$('f-stats');
  if(st) st.textContent=filterSummary();
  const inp=$('f-kw');
  if(inp && inp.value!==FILTER.kw) inp.value=FILTER.kw;
  const dd=document.querySelector('#f-dup');
  if(dd && dd.classList){ dd.classList.toggle('on',!!FILTER.dropDup); if(dd.setAttribute) dd.setAttribute('aria-pressed',String(!!FILTER.dropDup)); }
}

function runFilter(){
  applyFilterAndTags();
  showNodes();
  renderFilterPanels();
  const m=$('msg');
  if(m){
    const d=(FILTER_APPLIED.removed||[]).length;
    m.className=d?'msg warn':'msg';
    m.textContent=d?('已删 '+d+' 个节点，生效 '+FILTER_APPLIED.kept.length+' 个；生成配置与二维码均使用删减后的结果')
                   :'未删除任何节点';
  }
}

function toggleDupDrop(){
  FILTER.dropDup=!FILTER.dropDup;
  filterSave(); runFilter();
}
function filterInputChanged(v){
  FILTER.kw=String(v||'');
  filterSave();
  runFilter();
}
function toggleNodeHidden(i){
  const n=NODES[i]; if(!n) return;
  FILTER.hidden[nodeKey(n)]=1;
  filterSave(); runFilter();
}
function restoreRemoved(i){
  const x=(FILTER_APPLIED.removed||[])[i]; if(!x) return;
  delete FILTER.hidden[nodeKey(x.node)];
  filterSave(); runFilter();
}
/* 一键：某个复用组只留第一个【当前仍存活】的节点，其余隐藏。
   代表不能取母本的 names[0] —— 它可能已被手动删除，那样会把整组删光。 */
function hideGroupExtra(gi){
  const g=(FILTER_APPLIED.groups||[])[gi]; if(!g) return;
  const want=g.type+'|'+g.endpoint;
  const keptList=FILTER_APPLIED.kept||[];
  let keepKey=null;
  for(const n of keptList){ if(aggKey(n, NAMETAG.ipMap)===want){ keepKey=nodeKey(n); break; } }
  if(keepKey===null) return;                 /* 组内已无存活节点，不再操作 */
  for(const n of MASTER){
    if(aggKey(n, NAMETAG.ipMap)===want && nodeKey(n)!==keepKey) FILTER.hidden[nodeKey(n)]=1;
  }
  filterSave(); runFilter();
}
function clearAllHidden(){
  FILTER.hidden=Object.create(null);
  FILTER.kw=''; FILTER.dropDup=false;
  filterSave(); runFilter();
}
function copyRemovedList(){
  const rs=FILTER_APPLIED.removed||[];
  if(!rs.length){ const m=$('msg'); if(m){m.className='msg warn';m.textContent='当前没有删除任何节点';} return; }
  copyText(rs.map(x=>String(x.node._orig||x.node.name||'')).join('\n'));
}
function exportFilteredSubscription(){
  const tagged=tagNodes(FILTER_APPLIED.kept, NAMETAG.ipMap, endpointCounts(MASTER, NAMETAG.ipMap));
  const lines=tagged.map(n=>node2uri(n)).filter(Boolean);
  if(!lines.length){ const m=$('msg'); if(m){m.className='msg err';m.textContent='没有可导出的节点';} return; }
  addResult($('outputs'),'删减后订阅（URI）','filtered-subscription.txt','text/plain', b64e(lines.join('\n')));
  $('empty-out').style.display='none';
  const g=$('gmsg'); if(g){g.className='msg ok';g.textContent='已导出删减后的订阅（'+lines.length+' 个节点，Base64 URI）';}
  $('result-card').scrollIntoView({behavior:'smooth',block:'start'});
}

/* ================= Clash dict → Node ================= */
function clashNode(p){
  if(!p||typeof p!=='object'||!p.type||!p.server) return null;
  const t=String(p.type).toLowerCase();
  const map={vmess:'vmess',vless:'vless',trojan:'trojan',ss:'ss',shadowsocks:'ss',
    hysteria2:'hysteria2',hysteria:'hysteria2',hy2:'hysteria2',tuic:'tuic',
    wireguard:'wireguard',anytls:'anytls',socks5:'socks5',socks:'socks5',http:'http',https:'http'};
  const proto=map[t]; if(!proto) return null;
  const ws=p['ws-opts']||p.ws||{}, grpc=p['grpc-opts']||p.grpc||{}, h2=p['h2-opts']||{},
        httpOpt=p['http-opts']||{}, gr=p['reality-opts']||p.reality||null,
        h3=p['h3-opts']||{}, ssh=p['ssh-opts']||{};
  const arr=v=>Array.isArray(v)?v:(v?String(v).split(','):null);
  const n={protocol:proto, name:p.name||proto, server:String(p.server), port:+p.port||443,
    uuid:p.uuid||p['client-id']||p.client_uuid||'', password:p.password||'',
    alterId:+(p.alterId!=null?p.alterId:p['alter_id'])||0,
    cipher:p.cipher||p.method||'', method:p.method||p.cipher||'',
    network:p.network||'tcp', security:p.tls?(p['reality-opts']?'reality':'tls'):(p.security||'none'),
    sni:p.servername||p.sni||p.sname||h3.sni||'', host:(ws.headers&&(ws.headers.Host||ws.headers.host))||h2.headers&&h2.headers.Host||p.host||'',
    path:ws.path||h2.path||httpOpt.path||p['ws-path']||p.path||'',
    alpn:arr(p.alpn), fingerprint:p['client-fingerprint']||p.fingerprint||'',
    insecure:!!p['skip-cert-verify'], flow:p.flow||'',
    reality:gr?{public_key:gr['public-key']||gr.public_key||'', short_id:String(gr['short-id']!=null?gr['short-id']:(gr.short_id||'')), spx:gr['public-key']?(gr.spx||''):''}:null,
    grpcServiceName:grpc['grpc-service-name']||'',
    obfsType:p.obfs||'', obfsPassword:p['obfs-password']||'',
    plugin:p.plugin||'', obfsParams:p['plugin-opts']||'',
    udp:p.udp!==false, raw:null};
  if(proto==='vmess'&&!n.cipher) n.cipher='auto';
  if(proto==='ss'&&!n.cipher) n.cipher=n.method||'chacha20-ietf-poly1305';
  if(proto==='hysteria2'){ n.alpn=n.alpn||['h3']; n.down=p.down||''; n.up=p.up||'';
    n.disableMTUDiscovery=!!p['disable-mtu-discovery']; }
  if(proto==='tuic'){ n.congestionControl=p['congestion-controller']||p.congestion_control||'cubic';
    n.udpRelayMode=p['udp-relay-mode']||p.udp_relay_mode||'native'; }
  if(proto==='wireguard'){ n.privateKey=p['private-key']||p.private_key||'';
    n.peerPublicKey=p['public-key']||p['peer-public-key']||p.public_key||'';
    n.preSharedKey=p['preshared-key']||p.pre_shared_key||'';
    const ip=p.ip||p['local-address']||'';
    n.localAddress=(Array.isArray(ip)?ip:String(ip).split(',')).map(s=>String(s).trim()).filter(Boolean);
    n.mtu=+p.mtu||1420; n.reserved=(arr(p.reserved)||[]).map(Number); }
  if(proto==='anytls'){ n.security=n.tls?'tls':'none'; }
  if(proto==='socks5'||proto==='http'){ n.username=p.username||''; n.password=p.password||''; }
  return n;
}
/* ================= sing-box outbound → Node ================= */
function singOutNode(o){
  if(!o||typeof o!=='object'||!o.type||!o.server) return null;
  const map={vmess:'vmess',vless:'vless',trojan:'trojan',shadowsocks:'ss',hysteria2:'hysteria2',
    tuic:'tuic',wireguard:'wireguard',anytls:'anytls',socks:'socks5',http:'http'};
  const proto=map[o.type]; if(!proto) return null;
  const tls=o.tls||{}, tr=o.transport||{}, hl=tr.headers||{};
  const rl=tls.reality||{}, arr=v=>Array.isArray(v)?v:(v?String(v).split(','):null);
  const n={protocol:proto, name:o.tag||o.type, server:String(o.server), port:+o.server_port||443,
    uuid:o.uuid||'', password:o.password||'', method:o.method||o.security||'',
    cipher:o.security||o.method||'', network:tr.type||'tcp',
    security:rl.enabled?'reality':(tls.enabled?'tls':'none'),
    sni:tls.server_name||'', host:hl.Host||hl.host||'', path:tr.path||'',
    alpn:arr(tls.alpn), fingerprint:(tls.utls||{}).fingerprint||'',
    insecure:!!tls.insecure, flow:o.flow||'',
    reality:rl.enabled?{public_key:rl.public_key||'', short_id:String(rl.short_id||''), spx:rl.handshake?((rl.handshake.path)||''):''}:null,
    grpcServiceName:tr.service_name||'', udp:o.udp_hop_interval!==undefined||true};
  if(proto==='vmess'){ n.alterId=o.alter_id||0; if(!n.cipher) n.cipher='auto'; }
  if(proto==='hysteria2'){ n.obfsType=(o.obfs||{}).type||''; n.obfsPassword=(o.obfs||{}).password||'';
    n.downMbps=o.down_mbps||''; n.upMbps=o.up_mbps||''; n.alpn=n.alpn||['h3'];
    n.disableMTUDiscovery=o.disable_mtu_discovery; }
  if(proto==='tuic'){ n.congestionControl=o.congestion_control||'cubic'; n.udpRelayMode=o.udp_relay_mode||'native'; }
  if(proto==='wireguard'){ n.privateKey=o.private_key||''; n.peerPublicKey=o.peer_public_key||'';
    n.preSharedKey=o.pre_shared_key||''; n.localAddress=(o.local_address||[]).slice();
    n.mtu=o.mtu||1420; n.reserved=(Array.isArray(o.reserved)?o.reserved:String(o.reserved||'').split(',')).map(x=>+x).filter(x=>!isNaN(x));
    n.port=+o.server_port||51820; }
  if(proto==='ss'&&!n.cipher) n.cipher=n.method;
  return n;
}
/* ================= 统一载入 ================= */
function collect(obj,found){
  if(!obj||typeof obj!=='object') return;
  [['proxies'],['Proxies'],['Proxy']].forEach(keys=>{
    keys.forEach(k=>{ const arr=obj[k];
      if(!Array.isArray(arr)) return;
      arr.forEach(p=>{
        if(typeof p==='string'){ const n=parseURI(p); if(n) found.push(n); return; }
        if(!p||typeof p!=='object') return;
        if(p.type==='select'||p.type==='url-test'||p.type==='fallback'||p.type==='load-balance'){
          (p.proxies||[]).forEach(x=>{}); return;   /* proxy-group：跳过 */
        }
        const n=clashNode(p); if(n) found.push(n);
      });
    });
  });
  if(Array.isArray(obj.outbounds)) obj.outbounds.forEach(o=>{ const n=singOutNode(o); if(n) found.push(n); });
  if(obj.Proxy) String(obj.Proxy).split(/\r?\n/).forEach(l=>{ const n=surgeLine(l); if(n) found.push(n); });
}
const NODES=[];
function loadContent(text){
  NODES.length=0;
  MASTER=[];
  FILTER_APPLIED={kept:[],removed:[],groups:[]};
  const found=[];
  const t=String(text||'').trim();
  if(!t) return {n:0, format:'空内容'};

  /* 1) JSON (sing-box) */
  if(/^[{[]/.test(t)){
    try{
      const j=JSON.parse(t);
      collect(j,found);
      if(found.length) return done(found,'sing-box JSON');
    }catch(e){}
  }
  /* 2) Surge CONF */
  if(/^\s*\[\s*Proxy\s*\]/im.test(t)){
    const sec=surgeSections(t);
    (sec['Proxy']||[]).concat(sec['proxy']||[]).forEach(l=>{ const n=surgeLine(l); if(n) found.push(n); });
    if(found.length) return done(found,'Surge CONF');
  }
  /* 3) Clash YAML */
  if(/(^|\n)\s*proxies?\s*[::]/.test(t)||/(^|\n)\s*proxy-groups\s*[::]/.test(t)){
    let y=null;
    try{ y=parseYAML(t); }catch(e){ console.warn('yaml fail',e); }
    if(y){
      collect(y,found);
      if(found.length) return done(found,'Clash YAML');
      const empty=Array.isArray(y.proxies)&&y.proxies.length===0;
      return {n:0, format:'Clash YAML',
        warn: empty ? '该 Clash 配置里的 proxies 是空的（机场按当前 User-Agent 下发了空壳模板）。请用 Clash Verge / v2rayN 抓取后复制原始 URI 订阅粘贴到「粘贴内容」。' : ''};
    }
  }
  /* 4) URI 列表 / Base64 订阅 */
  let lines=t.split(/\r?\n/).map(x=>trimStr(x)).filter(Boolean);
  const URI_RE=/^(vmess|vless|trojan|ss|ssr|hysteria2?|hy2|tuic|wireguard|wg|anytls|socks5?|https?):\/\//i;
  let looksURI=lines.some(l=>URI_RE.test(l));
  if(!looksURI){
    const dec=b64d(t.replace(/\s+/g,''));
    if(dec && dec.split(/\r?\n/).some(l=>URI_RE.test(trimStr(l)))){
      lines=dec.split(/\r?\n/).map(x=>trimStr(x)).filter(Boolean);
      looksURI=true;
    }
  }
  if(looksURI){
    lines.forEach(l=>{
      let line=l;
      if(!URI_RE.test(line)){ const d=b64d(line); if(d&&URI_RE.test(trimStr(d))) line=trimStr(d); }
      if(!URI_RE.test(line)) return;
      const n=parseURI(line);
      if(n) found.push(n);
    });
    if(found.length) return done(found,'URI 订阅');
  }
  return {n:0, format:'未知', warn:'无法识别内容格式。请确认粘贴的是完整订阅（Base64 订阅串 / Clash YAML / sing-box JSON / URI 列表）。'};

  function done(list,fmt){
    list.forEach(x=>{ if(!NODES.some(y=>y.protocol===x.protocol&&y.server===x.server&&y.port===x.port&&y.uuid===x.uuid&&y.password===x.password&&y.name===x.name)) NODES.push(x); });
    const fallback=parseNameMetadata(NODES);
    if(fallback.meta && SUB_META.source!=='Subscription-Userinfo'){ SUB_META=Object.assign(SUB_META,fallback.meta); fallback.drop.forEach(n=>{const i=NODES.indexOf(n);if(i>=0)NODES.splice(i,1);}); }
    dedupeNames(NODES);
    NODES.forEach(n=>{ n._orig=String(n._orig||n.name||''); });
    /* 母本 = 解析结果本身（未标注）；随后按删减规则派生 NODES。
       tagNodes 生成的是新对象，因此 MASTER 里的节点名始终保持原始值。 */
    MASTER=NODES.slice();
    const restored=filterLoad(filterScopeId());
    applyFilterAndTags();
    if(!restored) renderFilterPanels();
    return {n:NODES.length, format:fmt, master:MASTER.length, removed:(FILTER_APPLIED.removed||[]).length, restored:restored};
  }
}
function parseNameMetadata(list){
  const m={source:'node-name',upload:0,download:0,total:0,expire:null}, drop=new Set(); let remain=0;
  const size=/(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB|K|M|G|T)(?:B)?/i;
  list.forEach(n=>{
    const text=String(n.name||''), low=text.toLowerCase();
    const traffic=/流量|用量|traffic|quota|剩余|remain|used|total/.test(low);
    const expiry=/到期|有效期|expire|expires|valid/.test(low);
    if(!traffic&&!expiry)return;
    let hit=false, x=text.match(size);
    if(x&&traffic){const u=x[2].toUpperCase(), p={B:0,K:1,KB:1,M:2,MB:2,G:3,GB:3,T:4,TB:4}[u], v=Math.floor(Number(x[1])*Math.pow(1024,p)); if(/剩余|remain|left/.test(low))remain=Math.max(remain,v); else if(/已用|used|upload|download/.test(low))m.download=Math.max(m.download,v); else m.total=Math.max(m.total,v); hit=true;}
    let d=text.match(/(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})(?:日)?(?:[ T](\d{1,2})[:：](\d{2})(?::(\d{2}))?)?/);
    if(d&&expiry){m.expire=Math.floor(new Date(Date.UTC(+d[1],+d[2]-1,+d[3],d[4]||23,d[5]||59,d[6]||59)).getTime()/1000);hit=true;}
    const u=text.match(/(?<!\d)(1\d{9,})(?!\d)/); if(u&&expiry){m.expire=+u[1];hit=true;} if(hit)drop.add(n);
  });
  m.used=m.upload+m.download; if(remain)m.total=Math.max(m.total,remain+m.used); m.remaining=m.total?Math.max(0,m.total-m.used):null; return {meta:(m.total||m.used||m.expire)?m:null,drop};
}
function dedupeNames(list){
  const seen={};
  list.forEach(n=>{
    let base=n.name||n.protocol;
    if(seen[base]!=null){ seen[base]++; n.name=base+' #'+seen[base]; }
    else seen[base]=0;
  });
}

/* ================= Node → URI ================= */
function node2uri(n){
  const q=(o)=>obj2qs(clean(o));
  const name=encodeURIComponent(n.name||'');
  try{
    if(n.protocol==='vmess'){
      const d={v:'2', ps:n.name||'VMess', add:n.server, port:String(n.port), id:n.uuid,
        aid:String(n.alterId||0), scy:n.cipher||'auto', net:n.network||'tcp', type:n.type||'none',
        host:n.host||'', path:n.path||'', tls:n.security==='tls'?'tls':(n.security==='reality'?'reality':'')};
      if(n.sni&&n.sni!==n.host) d.sni=n.sni;
      if(n.alpn&&n.alpn.length) d.alpn=n.alpn.join(',');
      if(n.fingerprint) d.fp=n.fingerprint;
      if(n.network==='grpc'&&n.grpcServiceName) d.serviceName=n.grpcServiceName;
      if(n.reality){ d.pbk=n.reality.public_key; d.sid=n.reality.short_id; if(n.reality.spx) d.spx=n.reality.spx; }
      if(n.insecure) d.allowInsecure='1';
      return 'vmess://'+b64e(JSON.stringify(d));
    }
    if(n.protocol==='vless'){
      const o={encryption:n.encryption||'none', type:n.network||'tcp', security:n.security||'none'};
      if(n.flow) o.flow=n.flow;
      if(n.network==='ws'){ if(n.path) o.path=n.path; if(n.host) o.host=n.host; }
      if(n.network==='grpc'&&n.grpcServiceName) o.serviceName=n.grpcServiceName;
      if(n.network==='h2'){ if(n.host) o.host=n.host; if(n.path) o.path=n.path; }
      if(n.security==='tls'||n.security==='reality'){
        if(n.sni) o.sni=n.sni;
        if(n.alpn&&n.alpn.length) o.alpn=n.alpn.join(',');
        if(n.fingerprint) o.fp=n.fingerprint;
      }
      if(n.security==='reality'&&n.reality){
        o.pbk=n.reality.public_key; if(n.reality.short_id) o.sid=n.reality.short_id;
        if(n.reality.spx&&n.reality.spx!=='/') o.spx=n.reality.spx;
      }
      if(n.insecure) o.allowInsecure='1';
      if(n.udp===false) o.udp='false';
      return `vless://${n.uuid}@${addr(n.server)}:${n.port}?${q(o)}#${name}`;
    }
    if(n.protocol==='trojan'){
      const o={};
      if(n.security==='tls'||n.security!=='none'){
        if(n.sni) o.sni=n.sni; else if(n.peer) o.peer=n.peer;
        if(n.alpn&&n.alpn.length) o.alpn=n.alpn.join(',');
        if(n.fingerprint) o.fp=n.fingerprint;
        if(n.security==='reality') o.security='reality';
      }
      if(n.network&&n.network!=='tcp') o.type=n.network;
      if(n.network==='ws'&&n.path) o.path=n.path;
      if(n.network==='grpc'&&n.grpcServiceName) o.serviceName=n.grpcServiceName;
      if(n.insecure) o.allowInsecure='1';
      if(n.reality&&n.security==='reality'){ o.pbk=n.reality.public_key; if(n.reality.short_id)o.sid=n.reality.short_id; }
      return `trojan://${encodeURIComponent(n.password||'')}@${addr(n.server)}:${n.port}?${q(o)}#${name}`;
    }
    if(n.protocol==='ss'){
      const method=n.method||n.cipher||'chacha20-ietf-poly1305';
      const o={};
      if(n.plugin){ o.plugin=n.plugin + (n.obfsParams?('%3A'+encodeURIComponent(n.obfsParams)):''); }
      return `ss://${b64e(method+':'+(n.password||''))}@${addr(n.server)}:${n.port}${q(o)?('?'+q(o)):''}#${name}`;
    }
    if(n.protocol==='ssr'){
      const main=b64e(`${n.server}:${n.port}:${n.protocolParam||'origin'}:${n.method||'aes-256-cfb'}:${n.obfsType||'plain'}:${encodeURIComponent(n.server)}:${encodeURIComponent(n.password||'')}`)
        .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      return `ssr://${main}/?${q({proto_param:encodeURIComponent(n.protocolParam||''), obfsparam:encodeURIComponent(n.obfsPassword||'')})}#${name}`;
    }
    if(n.protocol==='hysteria2'){
      const o={};
      if(n.sni) o.sni=n.sni;
      if(n.insecure) o.insecure='1';
      if(n.alpn&&n.alpn.length) o.alpn=n.alpn.join(',');
      if(n.obfsType){ o.obfs=n.obfsType; if(n.obfsPassword) o['obfs-password']=n.obfsPassword; }
      if(n.disableMTUDiscovery) o.mtu='1400';
      if(n.down) o.downmbps=n.down; if(n.up) o.upmbps=n.up;
      return `hy2://${encodeURIComponent(n.password||'')}@${addr(n.server)}:${n.port}?${q(o)}#${name}`;
    }
    if(n.protocol==='tuic'){
      const o={};
      if(n.sni) o.sni=n.sni;
      if(n.alpn&&n.alpn.length) o.alpn=n.alpn.join(',');
      o.congestion_control=n.congestionControl||'cubic';
      o.udp_relay_mode=n.udpRelayMode||'native';
      if(n.insecure) o.allow_insecure='1';
      return `tuic://${encodeURIComponent(n.uuid||'')}:${encodeURIComponent(n.password||'')}@${addr(n.server)}:${n.port}?${q(o)}#${name}`;
    }
    if(n.protocol==='wireguard'){
      const o={ publickey:n.peerPublicKey||'', address:(n.localAddress||[]).join(','),
        mtu:n.mtu||1420, keepalive:n.persistentKeepalive||0 };
      if(n.preSharedKey) o.preshared_key=n.preSharedKey;
      if(n.reserved&&n.reserved.length) o.reserved=n.reserved.join(',');
      return `wg://${encodeURIComponent(n.privateKey||'')}@${addr(n.server)}:${n.port}?${q(o)}#${name}`;
    }
    if(n.protocol==='anytls'){
      const o={ sni:n.sni||n.server };
      if(n.alpn&&n.alpn.length) o.alpn=n.alpn.join(',');
      if(n.insecure) o.allowinsecure='1';
      if(n.fingerprint) o.fp=n.fingerprint;
      return `anytls://${encodeURIComponent(n.password||'')}@${addr(n.server)}:${n.port}?${q(o)}#${name}`;
    }
    if(n.protocol==='socks5'){
      const u=(n.username||n.password)?encodeURIComponent(n.username||'')+':'+encodeURIComponent(n.password||'')+'@':'';
      return `socks5://${u}${addr(n.server)}:${n.port}#${name}`;
    }
    if(n.protocol==='http'){
      const u=(n.username||n.password)?encodeURIComponent(n.username||'')+':'+encodeURIComponent(n.password||'')+'@':'';
      return `http://${u}${addr(n.server)}:${n.port}#${name}`;
    }
  }catch(e){ console.warn('uri gen fail',n,e); }
  return null;
}
function addr(s){ s=String(s||''); return /^[0-9a-fA-F:]*:[0-9a-fA-F:]+$/.test(s)&&s.includes(':')&&!/^\d+$/.test(s)?('['+s+']'):s; }

/* ================= Node → Clash dict ================= */
function node2clash(n){
  const o={ name:n.name, type:n.protocol, server:n.server, port:n.port };
  if(n.ip) o.ip=n.ip;
  const set=(k,v)=>{ if(v!==undefined&&v!==null&&v!=='') o[k]=v; };
  switch(n.protocol){
    case 'vmess':
      set('uuid',n.uuid); set('alterId',n.alterId||0); set('cipher',n.cipher||'auto');
      set('tls',n.security==='tls'||n.security==='reality'?true:undefined);
      set('servername',n.sni); set('client-fingerprint',n.fingerprint);
      set('skip-cert-verify',n.insecure?true:undefined);
      break;
    case 'vless':
      set('uuid',n.uuid); set('flow',n.flow); set('tls',n.security!=='none'?true:undefined);
      set('servername',n.sni); set('client-fingerprint',n.fingerprint);
      set('reality-opts',n.reality?{'public-key':n.reality.public_key,'short-id':n.reality.short_id}:undefined);
      set('skip-cert-verify',n.insecure?true:undefined); set('udp',n.udp!==false?true:undefined);
      break;
    case 'trojan':
      set('password',n.password); set('tls',n.security!=='none'?true:undefined);
      set('servername',n.sni); set('client-fingerprint',n.fingerprint);
      set('reality-opts',n.reality?{'public-key':n.reality.public_key,'short-id':n.reality.short_id}:undefined);
      set('skip-cert-verify',n.insecure?true:undefined);
      break;
    case 'ss':
      set('cipher',n.method||n.cipher||'chacha20-ietf-poly1305'); set('password',n.password);
      set('udp',true);
      if(n.plugin){ set('plugin',n.plugin);
        try{ const po=n.obfsParams?qs2obj(n.obfsParams.replace(/;/g,'&')):{};
          if(Object.keys(po).length) o['plugin-opts']=po; }catch(e){} }
      break;
    case 'hysteria2':
      set('password',n.password); set('sni',n.sni||undefined);
      set('skip-cert-verify',n.insecure?true:undefined); set('alpn',n.alpn&&n.alpn.length?n.alpn:['h3']);
      set('obfs',n.obfsType); set('obfs-password',n.obfsPassword);
      set('disable-mtu-discovery',n.disableMTUDiscovery?true:undefined);
      set('down',n.down); set('up',n.up);
      break;
    case 'tuic':
      set('uuid',n.uuid); set('password',n.password);
      set('congestion-controller',n.congestionControl||'cubic');
      set('udp-relay-mode',n.udpRelayMode||'native');
      set('sni',n.sni||undefined); set('alpn',n.alpn&&n.alpn.length?n.alpn:['h3']);
      set('skip-cert-verify',n.insecure?true:undefined);
      break;
    case 'wireguard':
      set('private-key',n.privateKey); set('public-key',n.peerPublicKey);
      set('pre-shared-key',n.preSharedKey);
      set('ip',(n.localAddress||[])[0]); set('mtu',n.mtu||1420);
      set('reserved',n.reserved&&n.reserved.length?n.reserved.join(', '):undefined);
      set('udp',true); o.type='wireguard';
      break;
    case 'anytls':
      set('password',n.password); set('sni',n.sni);
      set('skip-cert-verify',n.insecure?true:undefined);
      set('alpn',n.alpn); set('client-fingerprint',n.fingerprint);
      break;
    case 'socks5': set('username',n.username); set('password',n.password); break;
    case 'http': set('username',n.username); set('password',n.password); break;
  }
  // 传输层
  const net=(n.network||'tcp').toLowerCase();
  if(net!=='tcp'&&n.protocol!=='hysteria2'&&n.protocol!=='tuic'&&n.protocol!=='wireguard'){
    o.network=net==='h2'?'h2':net==='http'?'h2':net;
    if(net==='ws'){ const w={}; if(n.path) w.path=n.path;
      if(n.host) w.headers={Host:n.host}; if(Object.keys(w).length) o['ws-opts']=w; }
    else if(net==='grpc'){ const g={}; if(n.grpcServiceName) g['grpc-service-name']=n.grpcServiceName;
      if(Object.keys(g).length) o['grpc-opts']=g; o.udp=o.udp===undefined?true:o.udp; }
    else if(net==='h2'||net==='http'){ const h={}; if(n.path) h.path=n.path;
      if(n.host) h.headers={Host:n.host}; if(o.servername) h.host=[o.servername];
      if(Object.keys(h).length) o['h2-opts']=h; }
  }
  if(n.alpn&&n.alpn.length&&!['hysteria2','tuic'].includes(n.protocol)) o.alpn=n.alpn;
  return clean(o);
}
/* ================= Node → sing-box dict ================= */
function node2sing(n){
  const o={ type:n.protocol==='ss'?'shadowsocks':(n.protocol==='socks5'?'socks':n.protocol),
    tag:n.name, server:n.server, server_port:n.port };
  const set=(k,v)=>{ if(v!==undefined&&v!==null&&v!==''&&!(Array.isArray(v)&&!v.length)) o[k]=v; };
  const net=(n.network||'tcp').toLowerCase();
  const useTls=n.security==='tls'||n.security==='reality';
  switch(n.protocol){
    case 'vmess': set('uuid',n.uuid); set('alter_id',n.alterId||0); set('security',n.cipher||'auto');
      set('global_padding',undefined); break;
    case 'vless': set('uuid',n.uuid); set('flow',n.flow); set('packet_encoding',n.flow?'xudp':''); break;
    case 'trojan': set('password',n.password); break;
    case 'ss': set('method',n.method||n.cipher||'chacha20-ietf-poly1305'); set('password',n.password); break;
    case 'hysteria2': set('password',n.password);
      set('obfs',n.obfsType?{type:n.obfsType,password:n.obfsPassword||''}:undefined);
      if(n.down) set('down_mbps',+n.down); if(n.up) set('up_mbps',+n.up);
      break;
    case 'tuic': set('uuid',n.uuid); set('password',n.password);
      set('congestion_control',n.congestionControl||'cubic'); set('udp_relay_mode',n.udpRelayMode||'native'); break;
    case 'wireguard': set('private_key',n.privateKey); set('peer_public_key',n.peerPublicKey);
      set('pre_shared_key',n.preSharedKey); set('local_address',n.localAddress); set('mtu',n.mtu||1420);
      set('reserved',n.reserved); break;
    case 'anytls': set('password',n.password); break;
    case 'socks5': set('version','5'); set('username',n.username); set('password',n.password); break;
    case 'http': set('username',n.username); set('password',n.password); break;
  }
  if(useTls||['hysteria2','tuic'].includes(n.protocol)){
    const t={enabled:true};
    if(n.sni) t.server_name=n.sni;
    if(n.insecure) t.insecure=true;
    if(n.alpn&&n.alpn.length) t.alpn=n.alpn;
    if(n.fingerprint&&['vmess','vless','trojan','anytls'].includes(n.protocol))
      t.utls={enabled:true, fingerprint:n.fingerprint};
    if(n.security==='reality'&&n.reality)
      t.reality={enabled:true, public_key:n.reality.public_key, short_id:n.reality.short_id};
    o.tls=t;
  }
  if(!['hysteria2','tuic','wireguard'].includes(n.protocol)&&net!=='tcp'){
    const tr={type:net==='http'?'h2':net};
    if(net==='ws'){ if(n.path) tr.path=n.path; if(n.host) tr.headers={Host:n.host}; }
    if(net==='grpc'&&n.grpcServiceName) tr.service_name=n.grpcServiceName;
    if(net==='h2'){ if(n.path) tr.path=n.path; if(n.host) tr.host=[n.host]; }
    o.transport=tr;
  }
  return clean(o);
}

/* ================= 地区识别 ================= */
const CN2CC={'香港':'HK','澳门':'MO','台湾':'TW','美国':'US','日本':'JP','韩国':'KR','新加坡':'SG',
'英国':'GB','德国':'DE','法国':'FR','加拿大':'CA','澳大利亚':'AU','荷兰':'NL','俄罗斯':'RU','泰国':'TH',
'越南':'VN','印度':'IN','巴西':'BR','土耳其':'TR','西班牙':'ES','意大利':'IT','菲律宾':'PH','马来西亚':'MY',
'阿联酋':'AE','沙特':'SA','卡塔尔':'QA','以色列':'IL','南非':'ZA','墨西哥':'MX','阿根廷':'AR','智利':'CL',
'波兰':'PL','瑞典':'SE','瑞士':'CH','奥地利':'AT','比利时':'BE','丹麦':'DK','芬兰':'FI','挪威':'NO',
'爱尔兰':'IE','葡萄牙':'PT','希腊':'GR','罗马尼亚':'RO','乌克兰':'UA','捷克':'CZ','匈牙利':'HU',
'新西兰':'NZ','巴基斯坦':'PK','孟加拉':'BD','哈萨克斯坦':'KZ','乌兹别克斯坦':'UZ','老挝':'LA',
'柬埔寨':'KH','蒙古':'MN','尼泊尔':'NP','斯里兰卡':'LK','格鲁吉亚':'GE','亚美尼亚':'AM','阿塞拜疆':'AZ',
'摩尔多瓦':'MD','塞尔维亚':'RS','克罗地亚':'HR','波黑':'BA','黑山':'ME','阿尔巴尼亚':'AL','北马其顿':'MK',
'保加利亚':'BG','爱沙尼亚':'EE','拉脱维亚':'LV','立陶宛':'LT','斯洛文尼亚':'SI','斯洛伐克':'SK',
'卢森堡':'LU','马耳他':'MT','塞浦路斯':'CY','冰岛':'IS','直布罗陀':'GI','留尼汪':'RE','波多黎各':'PR',
'关岛':'GU','多米尼加':'DO','哥斯达黎加':'CR','巴拿马':'PA','秘鲁':'PE','哥伦比亚':'CO','委内瑞拉':'VE',
'厄瓜多尔':'EC','玻利维亚':'BO','乌拉圭':'UY','巴拉圭':'PY','埃及':'EG','摩洛哥':'MA','突尼斯':'TN',
'阿尔及利亚':'DZ','利比亚':'LY','尼日利亚':'NG','肯尼亚':'KE','加纳':'GH','坦桑尼亚':'TZ','乌干达':'UG',
'安哥拉':'AO','莫桑比克':'MZ','津巴布韦':'ZW','赞比亚':'ZM','埃塞俄比亚':'ET','约旦':'JO','黎巴嫩':'LB',
'伊拉克':'IQ','伊朗':'IR','科威特':'KW','巴林':'BH','阿曼':'OM','土库曼斯坦':'TM','塔吉克斯坦':'TJ',
'吉尔吉斯斯坦':'KG','斐济':'FJ','巴布亚新几内亚':'PG','缅甸':'MM','文莱':'BN','印尼':'ID'};
const CITY={'hongkong':'HK','hk':'HK','tokyo':'JP','tyo':'JP','osaka':'JP','kuala lumpur':'MY','kualalumpur':'MY',
'london':'GB','uk':'GB','new york':'US','newyork':'US','los angeles':'US','losangeles':'US','san jose':'US',
'sanjose':'US','san francisco':'US','seattle':'US','chicago':'US','dallas':'US','atlanta':'US','miami':'US',
'boston':'US','washington':'US','us':'US','usa':'US','singapore':'SG','sg':'SG','korea':'KR','kr':'KR',
'seoul':'KR','frankfurt':'DE','germany':'DE','de':'DE','amsterdam':'NL','netherlands':'NL','nl':'NL',
'paris':'FR','france':'FR','toronto':'CA','canada':'CA','ca':'CA','vancouver':'CA','montreal':'CA',
'sydney':'AU','melbourne':'AU','australia':'AU','au':'AU','bangkok':'TH','hanoi':'VN','hochiminh':'VN',
'vietnam':'VN','mumbai':'IN','india':'IN','delhi':'IN','moscow':'RU','russia':'RU','istanbul':'TR',
'turkey':'TR','madrid':'ES','spain':'ES','rome':'IT','milan':'IT','italy':'IT','manila':'PH','jakarta':'ID',
'indonesia':'ID','dubai':'AE','uae':'AE','riyadh':'SA','saudi':'SA','tel aviv':'IL','israel':'IL',
'sao paulo':'BR','saopaulo':'BR','brazil':'BR','buenos aires':'AR','buenosaires':'AR','argentina':'AR',
'santiago':'CL','chile':'CL','warsaw':'PL','poland':'PL','stockholm':'SE','sweden':'SE','zurich':'CH',
'switzerland':'CH','vienna':'AT','brussels':'BE','belgium':'BE','copenhagen':'DK','helsinki':'FI',
'oslo':'NO','dublin':'IE','lisbon':'PT','athens':'GR','bucharest':'RO','kyiv':'UA','prague':'CZ',
'budapest':'HU','auckland':'NZ','wellington':'NZ','new zealand':'NZ','karachi':'PK','dhaka':'BD',
'astana':'KZ','tashkent':'UZ','ulaanbaatar':'MN','mongolia':'MN','manama':'BH','muscat':'OM','doha':'QA',
'kathmandu':'NP','colombo':'LK','tbilisi':'GE','yerevan':'AM','baku':'AZ','chisinau':'MD','belgrade':'RS',
'zagreb':'HR','sarajevo':'BA','podgorica':'ME','skopje':'MK','tirana':'AL','sofia':'BG','tallinn':'EE',
'riga':'LV','vilnius':'LT','ljubljana':'SI','bratislava':'SK','luxembourg':'LU','valletta':'MT',
'nicosia':'CY','reykjavik':'IS','casablanca':'MA','cairo':'EG','lagos':'NG','nairobi':'KE','accra':'GH',
'kigali':'RW','maputo':'MZ','harare':'ZW','addis ababa':'ET','amman':'JO','beirut':'LB','baghdad':'IQ',
'tehran':'IR','turkmenbashi':'TM','dushanbe':'TJ','bishkek':'KG','vientiane':'LA','phnom penh':'KH',
'yangon':'MM','bandar seri':'BN','suva':'FJ','port moresby':'PG','havana':'CU','limaa':'PE','lima':'PE',
'bogota':'CO','caracas':'VE','quito':'EC','lapaz':'BO','la paz':'BO','montevideo':'UY','asuncion':'PY',
'san jose':'CR','panama':'PA','santo domingo':'DO','guatemala':'GT','tehuacan':'MX','mexico':'MX',
'san juan':'PR','talinn':'EE','krakow':'PL','gdansk':'PL','gothenburg':'SE','malmo':'SE','basel':'CH',
'geneva':'CH','hamburg':'DE','berlin':'DE','munich':'DE','dusseldorf':'DE','frankfort':'DE','lyon':'FR',
'marseille':'FR','bordeaux':'FR','milan':'IT','naples':'IT','barcelona':'ES','valencia':'ES','porto':'PT',
'manchester':'GB','birmingham':'GB','edinburgh':'GB','cardiff':'GB','rotterdam':'NL','the hague':'NL',
'antwerp':'BE','aarhus':'DK','turku':'FI','tartu':'EE','kaunas':'LT','gdansk':'PL','cluj':'RO',
'valencia':'ES','sevilla':'ES','bilbao':'ES','newcastle':'GB','bristol':'GB','glasgow':'GB','perth':'AU',
'brisbane':'AU','adelaide':'AU','canberra':'AU','darwin':'AU','hamilton':'NZ','christchurch':'NZ',
'taichung':'TW','kaohsiung':'TW','taipei':'TW','taoyuan':'TW','shatin':'HK','kowloon':'HK','abou dhabi':'AE',
'abu dhabi':'AE','sharjah':'AE','jeddah':'SA','khobar':'SA','petaling':'MY','penang':'MY','cochin':'IN',
'hyderabad':'IN','bangalore':'IN','chennai':'IN','kolkata':'IN','pune':'IN','lahore':'PK','islamabad':'PK',
'Rawalpindi':'PK','chittagong':'BD','colombo':'LK','fukuoka':'JP','nagoya':'JP','sapporo':'JP','kansai':'JP',
'kyoto':'JP','yokohama':'JP','incheon':'KR','busan':'KR','daegu':'KR','changhua':'TW','taichung':'TW'};
function detectRegion(n){
  // _orig：节点名标注（出口地址/复用）会改写 name，分组必须以原名为准
  const nm=String(n._orig||n.name||'');
  const raw=nm+' '+String(n.server||'');
  let low=raw.toLowerCase().replace(/[\s\-_·．.]/g,'');
  // 显式两位国家码：HK01 / SG-01 / us02
  let m=/(?:^|[^a-z])([a-z]{2})[-_ ]?\d{1,2}(?:[^a-z]|$)/i.exec(nm);
  if(m){ const cc=m[1].toUpperCase(); if(cc!=='ID'&&cc!=='IP'&&cc!=='OS'&&cc!=='TV'&&cc!=='PC'&&cc!=='TL'&&cc!=='LN') return {cc}; }
  m=/(?:^|[^a-z])([a-z]{2})(?=[0-9]{1,2}\b|\b)/i.exec(nm);
  // 中文国家/地区名
  for(const [zh,cc] of Object.entries(CN2CC)){ if(raw.includes(zh)) return {cc, zh}; }
  // 城市/英文国家名
  for(const [city,cc] of Object.entries(CITY)){ if(low.includes(city.replace(/[\s\-_]/g,''))) return {cc}; }
  // emoji 国旗 → 两位码
  m=/([\uD83C-\uDDFF]{2})/.exec(nm);
  if(m){ try{ const cc=Array.from(m[0]).map(ch=>String.fromCharCode(0x41+ch.codePointAt(0)-0x1F1E6)).join('');
    if(/^[A-Z]{2}$/.test(cc)) return {cc}; }catch(e){} }
  return {cc:'XX'};
}
function regionLabel(n){
  const r=detectRegion(n);
  const zh=CC2ZH[r.cc];
  return zh?zh:(r.cc==='XX'?'🌍 其他':r.cc+' 节点');
}
const CC2ZH={HK:'🇭🇰 香港',MO:'🇲🇴 澳门',TW:'🇨🇳 台湾',US:'🇺🇸 美国',JP:'🇯🇵 日本',KR:'🇰🇷 韩国',
SG:'🇸🇬 新加坡',GB:'🇬🇧 英国',DE:'🇩🇪 德国',FR:'🇫🇷 法国',CA:'🇨🇦 加拿大',AU:'🇦🇺 澳大利亚',
NL:'🇳🇱 荷兰',RU:'🇷🇺 俄罗斯',TH:'🇹🇭 泰国',VN:'🇻🇳 越南',IN:'🇮🇳 印度',BR:'🇧🇷 巴西',
TR:'🇹🇷 土耳其',ES:'🇪🇸 西班牙',IT:'🇮🇹 意大利',PH:'🇵🇭 菲律宾',MY:'🇲🇾 马来西亚',
AE:'🇦🇪 阿联酋',SA:'🇸🇦 沙特',QA:'🇶🇦 卡塔尔',IL:'🇮🇱 以色列',ZA:'🇿🇦 南非',MX:'🇲🇽 墨西哥',
AR:'🇦🇷 阿根廷',CL:'🇨🇱 智利',PL:'🇵🇱 波兰',SE:'🇸🇪 瑞典',CH:'🇨🇭 瑞士',AT:'🇦🇹 奥地利',
BE:'🇧🇪 比利时',DK:'🇩🇰 丹麦',FI:'🇫🇮 芬兰',NO:'🇳🇴 挪威',IE:'🇮🇪 爱尔兰',PT:'🇵🇹 葡萄牙',
GR:'🇬🇷 希腊',RO:'🇷🇴 罗马尼亚',UA:'🇺🇦 乌克兰',CZ:'🇨🇿 捷克',HU:'🇭🇺 匈牙利',NZ:'🇳🇿 新西兰',
PK:'🇵🇰 巴基斯坦',BD:'🇧🇩 孟加拉国',KZ:'🇰🇿 哈萨克斯坦',UZ:'🇺🇿 乌兹别克斯坦',LA:'🇱🇦 老挝',
KH:'🇰🇭 柬埔寨',MN:'🇲🇳 蒙古',NP:'🇳🇵 尼泊尔',LK:'🇱🇰 斯里兰卡',GE:'🇬🇪 格鲁吉亚',
AM:'🇦🇲 亚美尼亚',AZ:'🇦🇿 阿塞拜疆',MD:'🇲🇩 摩尔多瓦',RS:'🇷🇸 塞尔维亚',HR:'🇭🇷 克罗地亚',
BA:'🇧🇦 波黑',ME:'🇲🇪 黑山',AL:'🇦🇱 阿尔巴尼亚',MK:'🇲🇰 北马其顿',BG:'🇧🇬 保加利亚',
EE:'🇪🇪 爱沙尼亚',LV:'🇱🇻 拉脱维亚',LT:'🇱🇹 立陶宛',SI:'🇸🇮 斯洛文尼亚',SK:'🇸🇰 斯洛伐克',
LU:'🇱🇺 卢森堡',MT:'🇲🇹 马耳他',CY:'🇨🇾 塞浦路斯',IS:'🇮🇸 冰岛',GI:'🇬🇮 直布罗陀',
RE:'🇷🇪 留尼汪',PR:'🇵🇷 波多黎各',GU:'🇬🇺 关岛',DO:'🇩🇴 多米尼加',CR:'🇨🇷 哥斯达黎加',
PA:'🇵🇦 巴拿马',PE:'🇵🇪 秘鲁',CO:'🇨🇴 哥伦比亚',VE:'🇻🇪 委内瑞拉',EC:'🇪🇨 厄瓜多尔',
BO:'🇧🇴 玻利维亚',UY:'🇺🇾 乌拉圭',PY:'🇵🇾 巴拉圭',EG:'🇪🇬 埃及',MA:'🇲🇦 摩洛哥',
TN:'🇹🇳 突尼斯',DZ:'🇩🇿 阿尔及利亚',LY:'🇱🇾 利比亚',NG:'🇳🇬 尼日利亚',KE:'🇰🇪 肯尼亚',
GH:'🇬🇭 加纳',TZ:'🇹🇿 坦桑尼亚',UG:'🇺🇬 乌干达',AO:'🇦🇴 安哥拉',MZ:'🇲🇿 莫桑比克',
ZW:'🇿🇼 津巴布韦',ZM:'🇿🇲 赞比亚',ET:'🇪🇹 埃塞俄比亚',JO:'🇯🇴 约旦',LB:'🇱🇧 黎巴嫩',
IQ:'🇮🇶 伊拉克',IR:'🇮🇷 伊朗',KW:'🇰🇼 科威特',BH:'🇧🇭 巴林',OM:'🇴🇲 阿曼',
TM:'🇹🇲 土库曼斯坦',TJ:'🇹🇯 塔吉克斯坦',KG:'🇰🇬 吉尔吉斯斯坦',FJ:'🇫🇯 斐济',
PG:'🇵🇬 巴布亚新几内亚',MM:'🇲🇲 缅甸',BN:'🇧🇳 文莱',ID:'🇮🇩 印度尼西亚',CU:'🇨🇺 古巴',
GT:'🇬🇹 危地马拉',HN:'🇭🇳 洪都拉斯',SV:'🇸🇻 萨尔瓦多',NI:'🇳🇮 尼加拉瓜'};

/* ================= 分组 ================= */
function uniq(a){ const s=new Set(); return a.filter(x=>s.has(x)?false:(s.add(x),true)); }
/* 返回统一的分组模型：
   { groups:[{name,type,members,isNode}], order:[组名...], sel:[可作为策略出口的组名] } */
function groupNodes(nodes,opts){
  opts=opts||{};
  const names=nodes.map(n=>n.name);
  if(!nodes.length) return {groups:[], order:[], sel:[]};
  if(opts.groups===false||opts.groups==='none')
    return {groups:[], order:[], sel:names.slice(), all:names};

  const MODE=opts.groups==='all'?'all':(opts.groups==='region'?'region':'auto');
  const byRegion={};
  for(const n of nodes){ const rg=regionLabel(n); (byRegion[rg]=byRegion[rg]||[]).push(n.name); }
  const regions=Object.keys(byRegion);
  const mk=rg=>({name:rg, type:byRegion[rg].length>=2?'url-test':'select', members:byRegion[rg].slice()});
  let groups=[];

  if(MODE==='all'){
    const autoAll ={name:'🐠 自动选择', type:'url-test', members:names.slice()};
    const fbAll   ={name:'🎯 故障转移', type:'fallback', members:names.slice()};
    const manual  ={name:'🔰 手动选择', type:'select',   members:names.slice()};
    groups=[{name:'🚀 节点选择', type:'select',
             // Keep nodes directly in the main selector for clients that do not expand nested groups.
             members:[autoAll.name, fbAll.name].concat(regions).concat(regions.length?[manual.name]:[]).concat(names)},
            autoAll, fbAll].concat(regions.map(mk)).concat(regions.length?[manual]:[]);
  } else {
    // Keep one flat main selector. Some Android clients turn nested region
    // groups into separate tabs and then fail to expose their node members.
    // The main group must stay manually selectable. Automatic testing is
    // exposed as a separate group, rather than replacing node selection.
    groups=[{name:'🚀 节点选择', type:'select', members:names.slice()}];
    // 开启测速时补一个全节点 url-test，但不改变主组类型
    if(opts.test){
      groups=[{name:'🚀 节点选择', type:'select', members:['♻️ 自动选择'].concat(names.slice())},
              {name:'♻️ 自动选择', type:'url-test', members:names.slice()}];
    }
  }
  const seen=new Set();
  const out=groups.filter(g=>g.name&&!seen.has(g.name)&&(seen.add(g.name),true));
  return {groups:out, order:out.map(g=>g.name), sel:out.map(g=>g.name), all:names};
}
const AUTO_GROUP={url:'http://www.gstatic.com/generate_204',interval:300,tolerance:50,lazy:true};
/* 展开：把 group 模型转成 [{name, type, members(最终成员名，含组名或节点名)}] */
function expandGroups(nodes,grp){
  const names=new Set(nodes.map(n=>n.name));
  const gnames=new Set(grp.groups.map(g=>g.name));
  return grp.groups.map(g=>({name:g.name,type:g.type,
    members:g.members.filter(m=>names.has(m)||gnames.has(m)&&m!==g.name)}));
}

/* ================= Clash 完整配置 ================= */
function buildClash(list,opt){
  opt=opt||{};
  const names=list.map(n=>n.name);
  const g=groupNodes(list,opt);
  const proxies=list.map(node2clash);
  const pg=[];
  expandGroups(list,g).forEach(gr=>{
    const members=gr.members.slice();
    const o={name:gr.name,type:gr.type,proxies:uniq(members.concat(/^(select|fallback)$/.test(gr.type)?['DIRECT']:[]))};
    if(/url-test|fallback|load-balance/.test(gr.type)) Object.assign(o,AUTO_GROUP);
    pg.push(o);
  });
  const hasStr=str=>pg.some(x=>x.name===str);
  const policy=[];
  if(opt.rule){
    const P=hasStr('🚀 节点选择')?'🚀 节点选择':(pg[0]?pg[0].name:'DIRECT');
    const mediaG=hasStr('🌍 国外媒体')?'🌍 国外媒体':P;
    [['GEOSITE,youtube',mediaG],['GEOSITE,netflix',mediaG],['GEOSITE,twitter',P],
     ['GEOSITE,openai',P],['GEOSITE,anthropic',P],['GEOSITE,google',P],['GEOSITE,github',P],
     ['GEOSITE,gfw',P],['GEOSITE,category-ads-all','REJECT'],
     ['GEOSITE,private','DIRECT'],['GEOSITE,geolocation-cn','DIRECT'],
     ['GEOIP,CN','DIRECT,no-resolve'],['GEOIP,LAN','DIRECT,no-resolve'],
     ['GEOIP,PRIVATE','DIRECT,no-resolve']].forEach(([r,t])=>policy.push(r+','+t));
  }
  policy.push('MATCH,'+(hasStr('🐟 漏网之鱼')?'🐟 漏网之鱼':(pg[0]?pg[0].name:'DIRECT')));
  const cfg=clean({
    'mixed-port':7890, 'allow-lan':false, 'bind-address':'*', mode:opt.rule?'rule':'global',
    'log-level':'info', ipv6:false, 'unified-delay':true, 'tcp-concurrent':true,
    'find-process-mode':'strict', 'external-controller':'127.0.0.1:9090',
    'external-controller-cors':{'allow-private-network':true, 'allow-origins':['*']},
    profile:{'store-selected':true,'store-fake-ip':true},
    'geodata-mode':true, 'geo-auto-update':true, 'geo-update-interval':24,
    'geox-url':{'geoip':'https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.dat','geosite':'https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geosite.dat'},
    dns:opt.dns===false?undefined:CLASH_DNS,
    proxies, 'proxy-groups':pg, rules:policy
  });
  return dumpYAML(cfg);
}
const CLASH_DNS={
  enable:true, ipv6:false, 'enhanced-mode':'fake-ip', 'fake-ip-range':'198.18.0.1/16',
  'default-nameserver':['223.5.5.5','119.29.29.29'],
  nameserver:['https://doh.pub/dns-query','https://dns.alidns.com/dns-query'],
  fallback:['https://dns.cloudflare.com/dns-query','https://dns.google/dns-query'],
  'fallback-filter':{geoip:true,'geoip-code':'CN',domain:['+.google.com','+.githubusercontent.com']},
  'fake-ip-filter':['*.lan','*.local','*.localhost','localhost.ptlogin2.qq.com','+.stun.*.*',
    '*.msftconnecttest.com','*.msftncsi.com','xbox.*.*.microsoft.com','+.playstation.net','+.cybergame.net']
};

/* ================= sing-box 完整配置 ================= */
function buildSing(list,opt){
  opt=opt||{};
  const g=groupNodes(list,opt);
  const names=list.map(n=>n.name);
  const grps=expandGroups(list,g);
  const mainTag=grps.length?grps[0].name:'direct';
  const obs=[
    {type:'mixed',tag:'mixed-in',listen:'127.0.0.1',listen_port:2080,sniff:true},
    {type:'tun',tag:'tun-in',interface_name:'sing-tun',address:['172.19.0.1/30','fd00:dead:beef::1/64'],
      auto_route:true,strict_route:false,sniff:true,platform:{http_proxy:{enabled:false}}}
  ];
  const outs=[];
  if(grps.length){
    grps.forEach((gr,i)=>{
      const members=gr.members.slice();
      if(!members.length) return;
      if(gr.type==='url-test') outs.push(Object.assign({type:'urltest',tag:gr.name,outbounds:members},AUTO_GROUP_SING));
      else if(gr.type==='fallback') outs.push({type:'urltest',tag:gr.name,outbounds:members,interrupt_exists_connection:true,url:AUTO_GROUP_SING.url,interval:AUTO_GROUP_SING.interval});
      else if(gr.type==='load-balance') outs.push(Object.assign({type:'urltest',tag:gr.name,outbounds:members,interrupt_exists_connection:true},AUTO_GROUP_SING));
      else outs.push({type:'selector',tag:gr.name,outbounds:gr.name===grps[0].name?uniq(members.concat(['direct'])):members,default:members[0]});
    });
  } else {
    outs.push({type:'selector',tag:'节点选择',outbounds:names.slice(),default:names[0]});
  }
  outs.push({type:'direct',tag:'direct'});
  outs.push({type:'block',tag:'block'});
  outs.push({type:'dns',tag:'dns-out'});
  list.forEach(n=>{ const o=node2sing(n); if(o) outs.push(o); });
  const rules=[
    {action:'sniff'},
    {action:'route',outbound:'dns-out',protocol:['dns']},
    {action:'route',outbound:'direct',rule_set:'private'},
    {action:'route',outbound:'direct',clash_mode:'Direct'},
    {action:'route',outbound:mainTag,clash_mode:'Proxy'},
    {action:'route',outbound:'block',protocol:['quic']},
  ];
  if(opt.rule&&opt.geo){
    rules.push({action:'route',outbound:'direct',rule_set:'geoip-cn'});
    rules.push({action:'route',outbound:'direct',rule_set:'geosite-cn'});
  }
  rules.push({action:'route',outbound:mainTag});
  const rs=[{tag:'private',type:'remote',format:'binary',
    url:'https://testingcf.jsdelivr.net/gh/SagerNet/sing-geoip@rule-set/geoip_private.srs',download_detour:'direct'}];
  if(opt.rule&&opt.geo){
    rs.push({tag:'geoip-cn',type:'remote',format:'binary',url:'https://testingcf.jsdelivr.net/gh/SagerNet/sing-geoip@rule-set/geoip_cn.srs',download_detour:'direct'});
    rs.push({tag:'geosite-cn',type:'remote',format:'binary',url:'https://testingcf.jsdelivr.net/gh/SagerNet/sing-geosite@rule-set/geosite_category-cn.srs',download_detour:'direct'});
  }
  const cfg=clean({
    log:{level:'info',timestamp:true},
    dns:{
      servers:[
        {tag:'remote',address:'https://dns.cloudflare.com/dns-query',detour:mainTag,strategy:'prefer_ipv4'},
        {tag:'local',address:'https://dns.alidns.com/dns-query',detour:'direct',strategy:'prefer_ipv4'},
        {tag:'localhost',address:'local',detour:'direct'}
      ],
      rules:[
        {action:'route',server:'local',clash_mode:'Direct'},
        {action:'route',server:'local',outbound:'direct'},
        {action:'route',server:'local',query_type:['HTTPS']}
      ],
      final:'remote', independent_cache:true, disable_cache:false
    },
    inbounds:obs, outbounds:outs,
    route:{rules, final:mainTag, auto_detect_interface:true, max_open_files:10240,
      sniff:{override_destination:true}, rule_set:rs},
    experimental:{cache:{enabled:true},
      clash_api:{external_controller:'127.0.0.1:9097',external_ui:'ui',
        external_ui_download_url:'https://github.com/zephyruso/zashboard/releases/latest/download/dist.zip',
        mode:'rule'}}
  });
  return JSON.stringify(cfg,null,2);
}
const AUTO_GROUP_SING={url:'http://www.gstatic.com/generate_204',interval:'3m'};

/* ================= Surge ================= */
function buildSurge(list,opt){
  opt=opt||{};
  const g=groupNodes(list,{...opt,groups:opt.groups||'region'});
  const L=[], names=list.map(n=>n.name);
  L.push('[General]');
  L.push('skip-proxy = 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 100.64.0.0/10, 172.25.0.0/16, 127.0.0.1, localhost, *.local, *.crashlytics.com');
  L.push('allow-wifi-access = false'); L.push('ipv6 = false');
  L.push('enhanced-mode-by-rule = false'); L.push('show-error-page-for-reject = true');
  L.push('all-hybrid = false'); L.push('http-api = 1');
  L.push('test-timeout = 5'); L.push('internet-test-url = http://cp.baidu.com/');
  L.push('proxy-test-url = http://www.gstatic.com/generate_204');
  L.push('hijack-dns = *:53'); L.push('dns-server = 223.5.5.5, 119.29.29.29, system');
  L.push('skip-proxy = 127.0.0.1');
  L.push('');
  L.push('[Proxy]');
  list.forEach(n=>{ const s=node2surge(n); if(s) L.push(n.name+' = '+s); });
  L.push('');
  L.push('[Proxy Group]');
  expandGroups(list,g).forEach(gr=>{
    const t=gr.type==='url-test'?'url-test':(gr.type==='fallback'?'fallback':'select');
    const body=gr.members.join(', ');
    if(t==='select') L.push(`${gr.name} = select, ${body}`);
    else L.push(`${gr.name} = ${t}, ${body}, url=http://www.gstatic.com/generate_204, interval=300, tolerance=50${t==='fallback'?', timeout=5':''}`);
  });
  const mainName=g.groups.length?g.groups[0].name:'DIRECT';
  L.push(`🐟 漏网之鱼 = select, ${mainName}, DIRECT, REJECT-DROP`);
  L.push('');
  L.push('[URL Rewrite]'); L.push('');
  L.push('[Header Rewrite]'); L.push('');
  L.push('[MITM]'); L.push('skip-certificate-check = 1'); L.push('hostname = *.googlevideo.com'); L.push('');
  L.push('[Rule]');
  L.push('AND,((PROTOCOL,UDP),(DST-PORT,443)),REJECT-NO-DROP');
  L.push('COUNTRY,US,🇺🇸 美国');
  L.push('GEOSITE,CATEGORY_ADS_ALL,REJECT-DROP');
  L.push('GEOSITE,PRIVATE,DIRECT');
  L.push('GEOSITE,GEOSITE-CN,DIRECT');
  L.push('GEOIP,CN,DIRECT');
  L.push(`FINAL,🐟 漏网之鱼`);
  return L.join('\n')+'\n';
}
function node2surge(n){
  const t=(o)=>Object.entries(o).filter(([k,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>k+'='+v).join(', ');
  switch(n.protocol){
    case 'vmess':
      return `${n.server}, ${n.port}, vmess, username=${n.uuid}, alter-id=${n.alterId||0}, ${t({'vmess-mode':n.cipher||'auto','over-tls':n.security==='tls'||n.security==='reality'?'true':undefined,'tls-verification':n.insecure?'false':undefined,'tls-hosting':n.sni,'ws':n.network==='ws'?'true':undefined,'ws-path':n.network==='ws'?(n.path||'/'):undefined,'obfs-host':n.network==='ws'?n.host:undefined,'tcp-obsolete-header':n.network==='grpc'?'true':undefined,tag:n.name})}`;
    case 'vless':
      return `${n.server}, ${n.port}, vless, username=${n.uuid}, ${t({tls:n.security==='tls'||n.security==='reality'?'true':undefined,'reality':n.security==='reality'?'true':undefined,'reality-public-key':n.reality?n.reality.public_key:undefined,'reality-short-id':n.reality&&n.reality.short_id?n.reality.short_id:undefined,'tls-hosting':n.sni||n.server,'flow':n.flow,ws:n.network==='ws'?'true':undefined,'ws-path':n.network==='ws'?(n.path||'/'):undefined,'ws-host':n.network==='ws'?n.host:undefined,tag:n.name})}`;
    case 'trojan':
      return `${n.server}, ${n.port}, password=${n.password}, ${t({'over-tls':'true',sni:n.sni||n.server,alpn:(n.alpn||['http/1.1']).join(','),'tls-verification':n.insecure?'false':undefined,'reality':n.security==='reality'?'true':undefined,'reality-public-key':n.reality?n.reality.public_key:undefined,ws:n.network==='ws'?'true':undefined,'ws-path':n.network==='ws'?(n.path||'/'):undefined,tag:n.name})}`;
    case 'ss':
      return `${n.server}, ${n.port}, method=${n.method||n.cipher||'chacha20-ietf-poly1305'}, password=${n.password}, ${t({uot:'true','obfs-host':n.plugin?undefined:undefined,tag:n.name})}`;
    case 'hysteria2':
      return `${n.server}, ${n.port}, hysteria2, password=${n.password}, ${t({sni:n.sni||n.server,'skip-cert-verify':n.insecure?'true':undefined,obfs:n.obfsType,'obfs-param':n.obfsPassword,tag:n.name})}`;
    case 'tuic':
      return `${n.server}, ${n.port}, tuic-v5, token=${n.uuid}, password=${n.password}, ${t({sni:n.sni||n.server,'skip-cert-verify':n.insecure?'true':undefined,'congestion-controller':n.congestionControl||'cubic',tag:n.name})}`;
    case 'wireguard':
      return `${n.server}, ${n.port}, ${t({'public-key':n.peerPublicKey,'private-key':n.privateKey,'pre-shared-key':n.preSharedKey,ip:(n.localAddress||[]).map(x=>x.split('/')[0]).join('.'),mtu:n.mtu||1428,tag:n.name})}`;
    case 'anytls':
      return `${n.server}, ${n.port}, password=${n.password}, ${t({'over-tls':'true',sni:n.sni||n.server,'tls-verification':n.insecure?'false':undefined,tag:n.name})}`;
    case 'socks5': case 'http':
      return `${n.server}, ${n.port}${n.username?', username='+n.username+', password='+n.password:''}, ${t({tag:n.name})}`;
  }
  return null;
}

/* ================= Quantumult X ================= */
function buildQX(list,opt){
  opt=opt||{};
  const g=groupNodes(list,{...opt,groups:opt.groups||'region'});
  const L=['[GENERAL]','filter_local = file:///etc/quantumult-x/filter.conf','dns_server = 114.114.114.114','dns_server = 223.5.5.5','fallback_dns_server = 1.1.1.1, 8.8.8.8','dns_exclusion_list = *.cmpassport.com, *.jegotrip.com.cn, *.local','']
    , names=list.map(n=>n.name);
  L.push('[SERVER_REMOTE]'); list.forEach(n=>{const s=node2qx(n); if(s) L.push(s);}); L.push('');
  L.push('[POLICY]');
  expandGroups(list,g).forEach(gr=>{
    const t=gr.type==='url-test'?'url-speed':(gr.type==='fallback'?'fall-speed':'static');
    L.push(`${gr.name} = ${t}, ${gr.members.join(', ')}, expire-time=600, speed-timeout=5, default-policy=direct`);
  });
  L.push('🐟 漏网之鱼 = static, 🚀 节点选择, direct, reject'); L.push('');
  L.push('[FILTER_LOCAL]');
  L.push('final, 🐟 漏网之鱼'); L.push('');
  L.push('[URL_REWRITE]'); L.push('');
  L.push('[HEADER]'); L.push('');
  return L.join('\n')+'\n';
}
function node2qx(n){
  const t=(o)=>Object.entries(o).filter(([k,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>k+'='+v).join(', ');
  switch(n.protocol){
    case 'vmess': return `${n.server}:${n.port}, vmess=${n.uuid}, ${t({obfs:'websocket', 'obfs-host':n.host||undefined,'obfs-uri':n.path||undefined, over_tls:n.security==='tls'?'1':undefined, tag:n.name})}`;
    case 'vless': return `${n.server}:${n.port}, vless=${n.uuid}, ${t({over_tls:n.security!=='none'?'1':undefined, peer:n.sni||n.server, vless_flow:n.flow||undefined, reality:n.security==='reality'?'1':undefined, public_key:n.reality?n.reality.public_key:undefined, short_id:n.reality&&n.reality.short_id?n.reality.short_id:undefined, obfs:n.network==='ws'?'websocket':undefined, tag:n.name})}`;
    case 'trojan': return `${n.server}:${n.port}, password=${n.password}, ${t({over_tls:'1', peer:n.sni||n.server, tag:n.name})}`;
    case 'ss': return `${n.server}:${n.port}, method=${n.method||n.cipher||'chacha20-ietf-poly1305'}, password=${n.password}, ${t({obfs:n.plugin?'websocket':undefined,'obfs-host':undefined, tag:n.name})}`;
    case 'hysteria2': return `${n.server}:${n.port}, password=${n.password}, ${t({over_tls:'1', peer:n.sni||n.server, obfs:n.obfsType||undefined, 'obfs-param':n.obfsPassword||undefined, tag:n.name})}`;
    case 'tuic': return `${n.server}:${n.port}, password=${n.password}, ${t({uuid:n.uuid||undefined, peer:n.sni||n.server, congestion_controller:n.congestionControl||'cubic', tag:n.name})}`;
    case 'wireguard': return `${n.server}:${n.port}, method=wireguard, ${t({priv_key:n.privateKey, pubkey:n.peerPublicKey, pre_shared_key:n.preSharedKey, gw:(n.localAddress||[]).map(x=>x.split('/')[0]).join('.')||undefined, tag:n.name})}`;
    case 'socks5': return `${n.server}:${n.port}, method=socks5${n.username?', user='+n.username+', password='+n.password:''}, tag=${n.name}`;
    case 'http': return `${n.server}:${n.port}, method=http${n.username?', user='+n.username+', password='+n.password:''}, tag=${n.name}`;
  }
  return null;
}

/* ================= v2ray / SSR 纯 URI 列表 ================= */
function buildV2Ray(list,opt){
  return list.map(node2uri).filter(Boolean).join('\n');
}

// Leave empty in the public build. Set this to your own HTTPS relay origin before deploying.
const SELF_HOSTED_RELAY = '';

function dl(blob,name){
  const a=document.createElement('a'); const u=URL.createObjectURL(blob);
  a.href=u; a.download=name; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(u); a.remove(); },800);
}
function $(id){ return document.getElementById(id); }
let SUB_META={source:'browser',upload:0,download:0,total:0,expire:null,used:0,remaining:null,title:null};
function humanBytes(n){ if(n==null) return '未知'; const u=['B','KB','MB','GB','TB']; let x=Number(n)||0,i=0; while(x>=1024&&i<4){x/=1024;i++;} return (i?x.toFixed(2):Math.round(x))+' '+u[i]; }
function renderMeta(){
  const m=SUB_META, has=m.upload||m.download||m.total||m.expire;
  $('c-meta').style.display='block'; $('meta-source').textContent=has?'（响应头）':'（未提供流量信息）';
  $('meta-stats').innerHTML=has ? `<span>上传 <b>${humanBytes(m.upload)}</b></span><span>下载 <b>${humanBytes(m.download)}</b></span><span>已用 <b>${humanBytes(m.used)}</b></span><span>剩余 <b>${humanBytes(m.remaining)}</b></span><span>到期 <b>${m.expire?new Date(m.expire*1000).toLocaleString():'未知'}</b></span>` : '<span>服务器未暴露 Subscription-Userinfo，节点转换仍可继续</span>';
}
function parseUserinfo(v){
  const m={source:'Subscription-Userinfo',upload:0,download:0,total:0,expire:null};
  String(v||'').split(/[;,&]/).forEach(p=>{const a=p.trim().split('='); if(a.length<2)return; const k=a[0].trim().toLowerCase().replace(/-/g,'_'), n=Number(a[1]); if(k==='expire')m.expire=n; else if(['upload','download','total'].includes(k))m[k]=n;});
  m.used=m.upload+m.download; m.remaining=m.total?Math.max(0,m.total-m.used):null; return m;
}
async function fetchText(url){
  const mode=$('i-fetch').value, proxy=$('i-proxy').value.trim(), encoded=encodeURIComponent(url), ua=encodeURIComponent($('i-ua')?.value||'clash-verge/v1.3.6');
  const candidates={
    personal:SELF_HOSTED_RELAY?[SELF_HOSTED_RELAY+'/my-fetch?url='+encoded+'&ua='+ua]:[],
    direct:[url],
    allorigins:['https://api.allorigins.win/raw?url='+encoded],
    codetabs:['https://api.codetabs.com/v1/proxy?quest='+encoded],
    corslol:['https://api.cors.lol/?url='+encoded],
    jina:['https://r.jina.ai/http://'+url.replace(/^https?:\/\//,'')],
  };
  let list;
  if(mode==='custom'){
    if(!proxy) throw Error('请输入自定义代理地址');
    list=[proxy.replaceAll('{url}',encoded).replaceAll('{ua}',ua)];
  } else if(mode==='auto'){
    list=[].concat(candidates.direct,candidates.allorigins,candidates.codetabs,candidates.corslol,candidates.jina);
  } else list=candidates[mode]||candidates.direct;
  let last;
  for(const u of list){
    try{
      const ctrl=new AbortController(), timer=setTimeout(()=>ctrl.abort(),20000);
      const r=await fetch(u,{signal:ctrl.signal}); clearTimeout(timer);
      if(!r.ok) throw Error('HTTP '+r.status);
      const h=r.headers.get('subscription-userinfo');
      const text=await r.text();
      const parsed=loadContent(text);
      if(!parsed.n) throw Error(parsed.warn||'响应内容无法解析为节点');
      if(h) SUB_META=parseUserinfo(h);
      return text;
    }catch(e){ last=e.name==='AbortError'?Error('请求超时'):e; }
  }
  throw last||Error('无法抓取订阅');
}
async function createRelay(btn){
  const url=$('i-url').value.trim(), ua=encodeURIComponent($('i-ua').value||'clash-verge/v1.3.6'), tag=encodeURIComponent((NAMETAG&&NAMETAG.mode)||'off');
  if(!url){$('msg').className='msg warn';$('msg').textContent='请先输入订阅 URL';return;}
  if(!SELF_HOSTED_RELAY){$('msg').className='msg warn';$('msg').textContent='此开源版未绑定公共中转；请部署自己的 relay 后设置 SELF_HOSTED_RELAY。';return;}
  const old=btn.textContent; btn.disabled=true; btn.textContent='正在创建…';
  try{const r=await fetch(SELF_HOSTED_RELAY+'/my-create?url='+encodeURIComponent(url)+'&ua='+ua+'&tag='+tag);if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();if(!d.id)throw Error('服务器未返回链接 ID');$('relay-url').value=SELF_HOSTED_RELAY+'/sub/'+d.id;$('relay-result').style.display='block';$('msg').className='msg ok';$('msg').textContent='新的订阅链接已创建，客户端刷新该链接时会按当前标注模式改写节点名';}
  catch(e){$('msg').className='msg err';$('msg').textContent='创建订阅链接失败：'+e.message;}
  finally{btn.disabled=false;btn.textContent=old;}
}
function copyRelay(){const v=$('relay-url').value;if(v)copyText(v);}
async function createConvertedRelay(btn){
  const url=$('i-url').value.trim(), ua=encodeURIComponent($('i-ua').value||'clash-verge/v1.3.6'), tag=encodeURIComponent((NAMETAG&&NAMETAG.mode)||'off');
  const selected=[...document.querySelectorAll('#fmts .choice.on')].map(x=>x.dataset.f).filter(x=>['clash','singbox','v2ray'].includes(x));
  if(!url){$('gmsg').className='msg warn';$('gmsg').textContent='请先在 URL 输入页填写订阅地址';return;}
  if(selected.length!==1){$('gmsg').className='msg warn';$('gmsg').textContent='转换订阅链接只能选择一种 Clash、sing-box 或 v2ray 格式';return;}
  if(!SELF_HOSTED_RELAY){$('gmsg').className='msg warn';$('gmsg').textContent='此开源版未绑定公共中转；请部署自己的 relay 后设置 SELF_HOSTED_RELAY。';return;}
  const options={}; document.querySelectorAll('#opts .choice.on').forEach(x=>options[x.dataset.o]=true);
  const target=selected[0]==='v2ray'?'uri':selected[0]; const old=btn.textContent; btn.disabled=true; btn.textContent='正在创建…';
  try{
    const q='url='+encodeURIComponent(url)+'&ua='+ua+'&tag='+tag+'&target='+encodeURIComponent(target)+'&options='+encodeURIComponent(JSON.stringify(options));
    const r=await fetch(SELF_HOSTED_RELAY+'/my-create?'+q); if(!r.ok)throw Error('HTTP '+r.status);
    const d=await r.json(); if(!d.id)throw Error('服务器未返回链接 ID');
    $('relay-url').value=SELF_HOSTED_RELAY+'/sub/'+d.id; $('relay-result').style.display='block';
    $('gmsg').className='msg ok'; $('gmsg').textContent='转换订阅已创建，客户端刷新时会重新抓取并转换';
  }catch(e){$('gmsg').className='msg err';$('gmsg').textContent='创建转换订阅失败：'+e.message;}
  finally{btn.disabled=false;btn.textContent=old;}
}
function showNodes(){
  $('c-nodes').style.display='block';
  const rm=(typeof FILTER_APPLIED!=='undefined'&&FILTER_APPLIED.removed)?FILTER_APPLIED.removed.length:0;
  $('cnt').textContent=NODES.length+' 个节点'+(rm?('（已删 '+rm+'）'):'');
  $('nodes').innerHTML=NODES.map((n,i)=>`<div class="node"><div class="node-row"><div><b>${esc(n.name)}</b><small>${esc(n._orig&&n._orig!==n.name?n._orig+' · ':'')}${esc(n.protocol)} · ${esc(n.server)}:${esc(n.port)}</small></div><button type="button" class="node-x" title="删除此节点" onclick="toggleNodeHidden(${i})">✕</button></div></div>`).join('');
  const cf=$('c-filter'); if(cf) cf.style.display=(typeof MASTER!=='undefined'&&MASTER.length)?'block':'none';
  if(typeof renderFilterPanels==='function') renderFilterPanels();
}
let urlInputRevision=0;
function resetUrlResults(){
  urlInputRevision++;
  NODES.length=0;
  if(typeof MASTER!=='undefined') MASTER.length=0;
  if(typeof FILTER_APPLIED!=='undefined') FILTER_APPLIED={kept:[],removed:[],groups:[]};
  const _cf=$('c-filter'); if(_cf) _cf.style.display='none';
  SUB_META={source:'browser',upload:0,download:0,total:0,expire:null,used:0,remaining:null,title:null};
  $('c-nodes').style.display='none'; $('c-meta').style.display='none';
  $('nodes').innerHTML=''; $('cnt').textContent=''; $('msg').textContent=''; $('msg').className='msg';
  $('outputs').innerHTML=''; $('empty-out').style.display='block'; $('gmsg').textContent=''; $('gmsg').className='msg';
}
async function run(){
  const revision=urlInputRevision, inputUrl=$('i-url').value.trim(), tab=document.querySelector('.tab.on')?.dataset.t;
  $('loading').style.display='block'; $('msg').textContent=''; SUB_META={source:'browser',upload:0,download:0,total:0,expire:null,used:0,remaining:null};
  try{let text='';
    if(tab==='url') text=await fetchText(inputUrl);
    else if(tab==='file'){const f=$('i-file').files[0]; if(!f)throw Error('请选择文件'); text=await f.text();}
    else text=$('i-text').value;
    if(tab==='url' && revision!==urlInputRevision) return;
    const r=loadContent(text); if(!r.n)throw Error(r.warn||'无法解析订阅');
    $('msg').textContent=`${r.format}，母本 ${r.master||r.n} 个节点`+(r.removed?`；已按记录删除 ${r.removed} 个，生效 ${r.n} 个`:(r.restored?'；沿用上次删减规则':'，解析到 '+r.n+' 个节点'));
    showNodes(); renderMeta();
  }catch(e){if(!(tab==='url' && revision!==urlInputRevision)){$('msg').textContent='错误：'+e.message; $('c-nodes').style.display='none';}} finally{$('loading').style.display='none';}
}
const GENERATED={}; let genSeq=0;
function copyText(text){ navigator.clipboard?.writeText(text).then(()=>{ $('gmsg').className='msg ok'; $('gmsg').textContent='已复制到剪贴板'; }).catch(()=>{ $('gmsg').className='msg warn'; $('gmsg').textContent='复制失败，请使用预览框手动复制'; }); }
function addResult(out,label,name,type,data){
  const card=document.createElement('div'); card.className='result-card';
  const head=document.createElement('div'); head.className='result-head'; head.innerHTML='<span><b>'+label+'</b><small> · '+name+' · '+new Blob([data]).size+' B</small></span>';
  const actions=document.createElement('div'); actions.className='result-actions';
  const pre=document.createElement('pre'); pre.className='preview'; pre.textContent=data;
  [['⬇️ 下载',()=>dl(new Blob([data],{type}),name)],['📋 复制',()=>copyText(data)],['👁️ 预览',()=>pre.classList.toggle('show')]].forEach(([text,fn])=>{const b=document.createElement('button');b.className='btn btn-line mini';b.textContent=text;b.onclick=fn;actions.appendChild(b);});
  card.append(head,actions,pre); out.appendChild(card);
}
function gen(){
  const gmsg=$('gmsg'); if(!NODES.length){gmsg.className='msg err';gmsg.textContent='请先解析订阅';return;}
  const selected=[...document.querySelectorAll('#fmts .choice.on')]; if(!selected.length){gmsg.className='msg warn';gmsg.textContent='请至少选择一种输出格式';return;}
  const opt={}; document.querySelectorAll('#opts .choice.on').forEach(x=>opt[x.dataset.o]=true); const out=$('outputs'); out.innerHTML='';
  const defs={clash:['Clash Meta','config.yaml','text/yaml'],singbox:['sing-box','config.json','application/json'],v2ray:['v2ray 订阅','v2ray.txt','text/plain'],surfboard:['Surge','surge.conf','text/plain'],qx:['Quantumult X','quantumult-x.conf','text/plain']};
  selected.forEach(x=>{const f=x.dataset.f,d=defs[f];let data=f==='clash'?buildClash(NODES,opt):f==='singbox'?buildSing(NODES,opt):f==='v2ray'?b64e(buildV2Ray(NODES,opt)):f==='surfboard'?buildSurge(NODES,opt):buildQX(NODES,opt);if(f==='clash'&&(SUB_META.upload||SUB_META.download||SUB_META.total||SUB_META.expire))data='# Subscription-Userinfo: upload='+SUB_META.upload+'; download='+SUB_META.download+'; total='+SUB_META.total+'; expire='+(SUB_META.expire||0)+'\n'+data;addResult(out,d[0],d[1],d[2],data);});
  addResult(out,'订阅信息','subscription-meta.json','application/json',JSON.stringify({...SUB_META,node_count:NODES.length},null,2)); $('empty-out').style.display='none';gmsg.className='msg ok';gmsg.textContent='已生成 '+selected.length+' 个配置，可下载、复制或预览';$('result-card').scrollIntoView({behavior:'smooth',block:'start'});
}
/* ================= 演示数据 ================= */
function loadDemo(){ const uris=['vless://11111111-2222-3333-4444-555555555555@hk01.example.com:54183?encryption=none&security=reality&type=tcp&sni=demo.example.com&pbk=wfREB0000000000000000000000000000000000000000000000&sid=9480bd1f859c1e#HK01-Demo','vmess://'+b64e(JSON.stringify({v:'2',ps:'US01-WS-Demo',add:'us.example.com',port:'443',id:'b2c3d4e5-f6a7-8901-bcde-f12345678901',net:'ws',path:'/vmess',tls:'tls'}))]; switchTab('text'); $('i-text').value=uris.join('\n'); run(); }
function switchTab(t){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x.dataset.t===t));document.querySelectorAll('.pane').forEach(x=>x.classList.remove('on'));$('p-'+t).classList.add('on');}
window.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('.tab').forEach(x=>x.onclick=()=>switchTab(x.dataset.t));document.querySelectorAll('.choice').forEach(x=>x.onclick=()=>{if(x.dataset.nt){document.querySelectorAll('#nametag-mode .choice').forEach(y=>{const on=y===x;y.classList.toggle('on',on);y.setAttribute('aria-pressed',String(on));});NAMETAG.mode=x.dataset.nt;NAMETAG.markDup=x.dataset.nt!=='off';refreshNameTags();return;}if(x.dataset.fd){toggleDupDrop();return;}const on=!x.classList.contains('on');x.classList.toggle('on',on);x.setAttribute('aria-pressed',String(on));});$('i-url').addEventListener('input',resetUrlResults);$('i-fetch').onchange=()=>{const custom=$('i-fetch').value==='custom';$('i-proxy').style.display=custom?'block':'none';$('custom-hint').style.display=custom?'block':'none';$('ua-hint').textContent=custom?'自定义代理 URL 支持 {url}（订阅地址）和 {ua}（所选客户端 UA）两个占位符；代理服务需负责转发 UA。':'我的服务器会将上方选择的 UA 转发给订阅源。若返回空壳配置，可切换 Clash Meta、Clash Verge、v2rayN 或 sing-box 后重试。';};const u=new URLSearchParams(location.search).get('url')||new URLSearchParams(location.search).get('sub');if(u){switchTab('url');$('i-url').value=u;}});

/* ================= 二维码（纯前端本地生成） =================
 * 依赖 vendor/qrcode.js（Kazuhiko Arase 的 qrcode-generator，MIT License）。
 * 二维码在本机生成，不把订阅链接（含密钥）发送给任何第三方服务。
 */
function qrCellSize(text){
  const len=(text||'').length;
  let size=4;                       // 默认版本 4 足够 126 字符（纠错 M）
  if(len>126) size=6;               // 版本 6 可到 208 字符
  if(len>208) size=8;               // 版本 8 可到 330 字符
  if(len>330) size=10;              // 版本 10 可到 488 字符
  return Math.min(size,40);
}
function qrTypeNumber(text){
  const cells=qrCellSize(text);
  return cells===40?40:(cells-1)*4+1;
}
function makeQRCanvas(text,px){
  if(typeof qrcode!=='function'||!text) return null;
  const qr=qrcode(qrTypeNumber(text),'M');
  if(!qr) return null;
  qr.addData(text); qr.make();
  const mod=qr.getModuleCount(), n=qr.getModuleCount()+8, s=Math.ceil(px/n);
  if(n<=0||mod<=0) return null;
  const cv=document.createElement('canvas');
  cv.width=s*n; cv.height=s*n;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,cv.width,cv.height);
  ctx.fillStyle='#0b0e1a';
  for(let r=0;r<mod;r++) for(let c=0;c<mod;c++) if(qr.isDark(r,c)) ctx.fillRect((c+4)*s,(r+4)*s,s,s);
  return cv;
}
function showQR(id,text){
  const wrap=document.getElementById(id);
  if(!wrap) return;
  wrap.innerHTML='';
  const cv=makeQRCanvas(text,240);
  if(!cv){ wrap.textContent='二维码生成失败'; wrap.style.display='block'; return; }
  wrap.appendChild(cv);
  wrap.style.display='flex';
}
function downQRBlob(text){
  const cv=makeQRCanvas(text,360);
  return cv && cv.toDataURL('image/png');
}
function downloadQR(note,text){
  const ok=0, bad='';
  const data=downQRBlob(text);
  if(!data){ const m=$('msg'); if(m){m.className='msg err';m.textContent='二维码生成失败';} return; }
  const a=document.createElement('a');
  a.href=data; a.download=(note||'subscription')+'-qrcode.png';
  document.body.appendChild(a); a.click(); setTimeout(()=>a.remove(),900);
}
function showRelayQR(){
  const url=$('relay-url').value.trim();
  if(!url){$('msg').className='msg warn';$('msg').textContent='请先生成订阅链接';return;}
  showQR('relay-qr',url);
  $('relay-qr-down').style.display='inline-block';
}
function downloadRelayQR(){
  const url=$('relay-url').value.trim();
  if(!url){$('msg').className='msg warn';$('msg').textContent='请先生成订阅链接';return;}
  downloadQR('subconv-subscription',url);
}