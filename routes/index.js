
/*
 * GET home page.
 */

exports.index = function(req, res){
  if(!!req.query.r === false) {
    var r = Math.floor(Math.random()*1000000);
    res.redirect("/?r="+r);
  } else {
    res.render('index', { title: 'WebRTC dataChannel demo' });
  }
};
