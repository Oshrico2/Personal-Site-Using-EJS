import 'dotenv/config';
import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import _ from "lodash";
import ejs from "ejs";
import session from "express-session";
import passport from 'passport';
import passportLocalMongoose from "passport-local-mongoose";
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as GitHubStrategy } from 'passport-github2';
import findOrCreate from 'mongoose-findorcreate';
import nodemailer from "nodemailer";
import bcrypt from "bcrypt";

import projects from "./projects.js";
import emojies from "./emojies.js";

function daysPassedSince(date) {
    const today = new Date();
    const timeDifference = today - date;
    const daysPassed = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
    return daysPassed;
}


const transporter = nodemailer.createTransport({
  host: 'smtp.office365.com',
  port: 587,
  secure: false,
  auth: {
    user: 'osherc@tlp-ins.co.il',
    pass: process.env.PASSWORD_FOR_MAIL
  }
});

const app = express();
const port = 3000;
// const saltRounds = 10; bcrypt



app.use(express.static("public"));
app.set('view engine','ejs');
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    secret:process.env.SECRET,
    resave:true,
    saveUninitialized:true
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect(process.env.DATABASE,{useNewUrlParser: true});

const userSchema = new mongoose.Schema({
    name:String,
    email:String,
    password:String,
    googleId:String,
    facebookId:String,
    githubId:String,
    emoji:String,
    posts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }]
});

userSchema.pre('save', function(next) {
    if (!this.emoji) {
        const randomEmojiNumber = Math.floor(Math.random() * (emojies.length)); // Generates a random number between 1 and 10
        this.emoji = emojies[randomEmojiNumber];
    }
    next();
});

const postScheme = new mongoose.Schema({
    author:String,
    title:String,
    content:String,
    date:Date,
    emoji:String
  });

  const counterSchema = new mongoose.Schema({
    visits: { type: Number, default: 0 }
  });

  const Counter = mongoose.model('Counter', counterSchema);

  Counter.findOne()
  .then((counter) => {
    if (!counter) {
      Counter.create({});
    }
  })
  .catch((err) => {
    console.error(err);
  });

  const contactSchema = new mongoose.Schema({
    name:String,
    email:String,
    message:String
  });

  const Contact = mongoose.model('Contact', contactSchema);


  let numOfVisits; 



userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User",userSchema);
const Post = mongoose.model("Post",postScheme);



passport.use(User.createStrategy());



//for any authentication
passport.serializeUser(function(user,done){
    done(null,user.id);
});

passport.deserializeUser(function(id,done){
    User.findById(id)
    .then(user => {
        done(null, user);
    })
    .catch(err => {
        done(err, null);
    });

});


passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "https://www.oshercohen.com/auth/google/secrets/google-callback"
  },
  function(accessToken, refreshToken, profile, cb) {
    console.log(process.env.PORT);
    User.findOrCreate(
      { googleId: profile.id },
      { 
        name: _.startCase(profile.displayName),
        username: _.startCase(profile.displayName)
      }, 
      function (err, user) {
        return cb(err, user);
      }
    );
  }
));



passport.use(new FacebookStrategy({
    clientID: process.env.CLIENT_ID_FACEBOOK,
    clientSecret: process.env.CLIENT_SECRET_FACEBOOK,
    callbackURL:  "https://www.oshercohen.com/auth/facebook/secrets",
    profileFields: ['id', 'displayName', 'photos', 'email']
  },
  function(accessToken, refreshToken, profile, cb) {
    console.log(process.env.PORT);
    User.findOrCreate(
      { facebookId: profile.id ,
        name: _.startCase(profile.displayName),username: _.capitalize(profile.displayName)},
      function (err, user) {
        return cb(err, user);
      }
    );
  }
));


passport.use(new GitHubStrategy({
    clientID: process.env.CLIENT_ID_GITHUB,
    clientSecret: process.env.CLIENT_SECRET_GITHUB,
    callbackURL: "https://www.oshercohen.com/auth/github/secrets"
  },
  function(accessToken, refreshToken, profile, done) {
    console.log(process.env.PORT);
    User.findOrCreate({ githubId: profile.id },
         { name: _.capitalize(profile.username),username: _.capitalize(profile.username)},
     function (err, user) {
      return done(err, user);
    });
  }
));


app.get("/", async (req, res) => {
    try {
      const counter = await Counter.findOneAndUpdate({}, { $inc: { visits: 1 } }, { new: true });
      console.log(process.env.PORT);

      res.render("index.ejs", { backgroundImage: '/images/background.jpg'
      ,visits:counter.visits
      });
    } catch (err) {
      console.error(err);
      res.status(500).send('Internal Server Error');
    }
  });

app.get("/blog", function(req, res){
    if (req.isAuthenticated()){
        const currentUser = req.user;
        Post.find({}).then(currentPosts=>{
            res.render("blog",{user:currentUser,posts:currentPosts
                ,dayPassed:daysPassedSince
                ,backgroundImage:'/images/background-blog.jpg'
                });
        }).catch(err=>{
            console.log(err);
        });
        
    } else {
      res.redirect("/login");
    }
  });

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile'] })
);

app.get('/auth/google/secrets', 
passport.authenticate('google', { failureRedirect: '/login' }),
function(req, res) {

    // Successful authentication, redirect blog.
    res.redirect('/blog');
});

app.get('/auth/facebook',
  passport.authenticate('facebook'));

app.get('/auth/facebook/secrets',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect blog.
    res.redirect('/blog');
  });

  app.get('/auth/github',
  passport.authenticate('github', { scope: [ 'user:email' ] }));

app.get('/auth/github/secrets', 
  passport.authenticate('github', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect blog.
    res.redirect('/blog');
  });

app.get("/about",(req,res)=>{
    res.render("about.ejs", { backgroundImage: '/images/cv.jpg' ,projects:projects});
});

app.get("/login",(req,res)=>{
    res.render("login.ejs");
});

app.get("/compose",(req,res)=>{
    res.render("compose",{backgroundImage:'/images/background-blog.jpg'});
});

app.get("/contact",(req,res)=>{
  res.render("contact",{backgroundImage:'/images/background-contact.jpg'});
});


let statisticsData =
 { 
  visits: 0,
  topFan:null,
  countTopFan:0,
  numPosts:0,
  regUsers:0,
  postPerHour:0

};

app.get('/statistics', async (req, res) => {
  try {
    const result1 = await Counter.findOne({}, 'visits');
    const result2 =  await User.aggregate([{$project: {_id: 1,name: 1
    ,postCount: { $size: '$posts' }}}, {$sort: { postCount: -1 }}, { $limit: 1 }
    ]);
    const result3 = await Post.countDocuments({});
    const result4 = await User.countDocuments({});
    const result5 = await Post.aggregate([
      { $addFields: { hour: { $hour: "$date" } } },
      { $group: { _id: { hour: "$hour" }, postCount: { $sum: 1 } } },
      { $sort: { postCount: -1 } },
      { $limit: 1 },
      { $project: { _id: 0, hour: "$_id.hour", postCount: 1 } }
    ]);
    
    statisticsData.visits = result1.visits;
    if(result2[0].name)
      statisticsData.topFan = result2[0].name;
    if(result2[0].postCount)
      statisticsData.countTopFan = result2[0].postCount;
    statisticsData.numPosts = result3;
    statisticsData.regUsers = result4;
    if(result5[0].postCount)
      statisticsData.postPerHour = result5[0].postCount;
    res.render("statistics",{stats:statisticsData,backgroundImage:'/images/background-stats.jpg'});
  } catch (error) {
    console.error(error);
    res.status(500).send('Error retrieving statistics');
  }
});


app.get('/logout', function(req, res){
  req.logout(function(err) {
    if(err) {
      return next(err);
    }
    res.redirect('/');
  });
});



//bcrypt
// app.post("/register",(req,res)=>{
//     bcrypt.hash(req.body.passwordRegister, saltRounds, function(err, hash) {
//         const newUser = new User({
//             name:_.startCase(req.body.name),
//             email:req.body.emailRegister,
//             password: hash
//         });
    
//         newUser.save()
//         res.render("blog");
//     });
    
// });

// app.post("/login",(req,res)=>{
//     const username = req.body.emailLogin;
//     const password = req.body.passwordLogin;
    
//     User.findOne({email:username}).then(foundUser=>{
//         bcrypt.compare(password, foundUser.password, function(err, result) {
//             if(result === true)
//                 res.render("blog");
//         });
//     }).catch(err=>{
//         if(err)
//             console.log(err);
//     })
// });


app.post('/register', (req, res) => {
    User.register(new User({ username: req.body.username,name:_.startCase(req.body.name)}), req.body.password, (err, user) => {
      if (err) {
        console.log(err);
        return res.render('register');
      }
      passport.authenticate('local')(req, res, () => {
        res.redirect('/blog');
      });
    });
  });

  app.post('/login', passport.authenticate('local', {
    successRedirect: '/blog',
    failureRedirect: '/login'
  }));


  app.get("/posts/:postId", function(req, res){
    const requestedPostId = req.params.postId;
    Post.findById({_id:requestedPostId}).then(post=>{
      res.render("post",{title:post.title,content:post.content});
    });
  
  });

  app.post("/compose",(req,res)=>{
    const newPost = new Post({
        author:req.user.name,
        title:req.body.postTitle,
        content:req.body.postBody,
        emoji:req.user.emoji,
        date:new Date()
    });
    newPost.save();
    User.updateOne({_id:req.user._id},
        {$push:{posts:newPost}}).then(result=>{
            console.log("Post saved");
            res.redirect("/blog");
        }).catch(err=>{
            console.log(err);
        })
            
  });

  app.post("/delete",(req,res)=>{
    const postIdToDelete = req.body.post;
  
    Post.findByIdAndDelete(postIdToDelete)
      .then((deletedPost) => {
        if (deletedPost) {
          console.log(`Successfully deleted post with ID: ${deletedPost._id}`);
          
          User.updateOne(
            { posts: postIdToDelete },
            { $pull: { posts: postIdToDelete } }
          )
            .then(() => {
              console.log(`Post ID removed from User's posts array`);
            })
            .catch((err) => {
              console.error(`Error removing post ID from User's posts array:`, err);
            });
  
        } else {
          console.log(`No post found with ID: ${postIdToDelete}`);
        }
  
        res.redirect("/blog");
      })
      .catch((err) => {
        console.error(err);
      });
  });
  
  
app.post("/contact",(req,res)=>{
  const contact = new Contact({
    name:req.body.name,
    email:req.body.email,
    message:req.body.message
  });
  contact.save();

  // Send email
  const mailOptions = {
    from: 'osherc@tlp-ins.co.il',
    to: 'oshrico2@gmail.com',
    subject: 'New Contact Form Submission',
    text: `Name: ${req.body.name}\nEmail: ${req.body.email}\nMessage: ${req.body.message}`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return console.log(error);
    }
    console.log('Email sent');
  });

  res.redirect("/contact");
});
  

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});



  
