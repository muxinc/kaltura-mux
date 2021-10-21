const path = require('path');
const WebpackAutoInject = require('webpack-auto-inject-version');

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'kaltura-mux.js',
    path: path.resolve(__dirname, 'build'),
    libraryTarget: 'umd',
    umdNamedDefine: true
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules|scripts|dist|build\//,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['es2015']
          }
        }
      }
    ]
  },
  plugins: [
    new WebpackAutoInject({
      components: {
        AutoIncreaseVersion: false,
        InjectAsComment: false,
        InjectByTag: true
      }
    })
  ],
  externals: {
    'kaltura-player-js': {
      root: 'KalturaPlayer', // indicates global variable
      commonjs: 'kaltura-player-js',
      commonjs2: 'kaltura-player-js',
      amd: 'kaltura-player-js'
    }
  }
};
