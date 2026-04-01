// 전역 에러 핸들러
function errorHandler(err, req, res, _next) {
  console.error('[Error]', err.message, err.stack);
  res.status(err.status || 500).json({
    data: null,
    error: err.message || '서버 오류가 발생했습니다.',
    message: err.message || '서버 오류가 발생했습니다.',
  });
}

module.exports = errorHandler;
