import {
  TextEditor,
} from 'vscode';
import { openTextDocument } from '../common';

export const asciiArtHandler: (character: string, replace: boolean) => (textEditor: TextEditor) => Thenable<boolean | void> = (character, replace) => (textEditor) => {
  if (textEditor.selections.length === 0) {
    return Promise.resolve();
  }

  const arts: { [key: string]: string } = {
    cowsay: `
        \\   ^__^
         \\  (oo)\\_______
            (__)\\       )\\/\\
                ||----w |
                ||     ||`,
    tux: `
        \\   .--.
         \\ |o_o |
           |:_/ |
          //   \\ \\
         (|     | )
        /'\\_   _/\`\\
        \\___)=(___/`,
    ghost: `
        \\     .-.
         \\   (o o)
          \\  | O \\
             \\   \\
              \`~~~\``,
    meow: `
        \\    |\\_/|
         \\   (o.o)
              =^=`,
    pig: `
        \\   _//| .-~~~-.
         \\ _/oo  }       }-@
         (  _  ,}       |
          \`---' \\_(\\/)_/`,
    face: `
        \\   (o)(o)
         \\ /      \\
           \\  ()  /
            \\ -- /`,
    daemon: `
        \\         ,        ,
         \\       /(        )\`
          \\      \\ \\___   / |
                 /- _  \`-/  '
                (/\\/ \\ \\   /\\
                / /   | \`    \\
                O O   ) /    |
                \`-^--'\`<     '
               (_.)  _  )   /
                \`.___/\`    /
                  \`-----' /
     <----.     __ / __   \\
     <----|====O)))==) \\) /====
     <----'    \`--' \`.__,' \\
                  |        |
                   \\       /
             ______( (_  / \\______
           ,'  ,-----'   |        \\
           \`--{__________)        \\/`,
    dragon: `
        \\                    / \\  //\\
         \\    |\\___/|      /   \\//  \\\\
          \\  /0  0  \\__  /    //  | \\ \\
            /     /  \\/_/    //   |  \\  \\
            @_^_@'/   \\/_   //    |   \\   \\
            //_^_/     \\/_ //     |    \\    \\
         ( //) |        \\///      |     \\     \\
       ( / /) _|_ /   )  //       |      \\     _\\
     ( // /) '/,_ _ _/  ( ; -.    |    _ _\\.-~        .-~~~^-.
   (( / / )) ,-{        _      \`-.|.-~-.           .~         \`.
  (( // / ))  '/\\      /                 ~-. _ .-~      .-~^-.  \\
  (( /// ))      \`.   {            }                   /      \\  \\
   (( / ))     .----~-.\\        \\-'                 .~         \\  \`. \\^-.
              ///.----..>        \\             _ -~             \`.  ^- \`  ^-_
                ///-._ _ _ _ _ _ _}^ - - - - ~                     ~-- ,.-~
                                                                   /.-~`,
    stegosaurus: `
        \\                             .       .
         \\                           / \`.   .' "
          \\                  .---.  <    > <    >  .---.
                             |    \\  \\ - ~ ~ - /  /    |
             _____          ..-~             ~-..-~
            |     |   \\~~~\\.'                    \`./~~~/
           ---------   \\__/                        \\__/
          .'  O    \\     /               /       \\  "
         (_____,    \`._.'               |         }  \\/~~~/
          \`----.          /       }     |        /    \\__/
                \`-.      |       /      |       /      \`. ,~~|
                    ~-.__|      /_ - ~ ^|      /- _      \`..-‘ / \\  /\\
                         |     /        |     /     ~-.     \`-/ _ \\/__\\
                         |_____|        |_____|         ~ - . _ _ _ _ _>`,
    turkey: `
        \\                                  ,+*^^*+___+++_
         \\                           ,*^^^^              )
          \\                       _+*                     ^**+_
                                +^       _ _++*+_+++_,         )
                 _+^^*+_    (     ,+*^ ^          \\+_        )
                {       )  (    ,(    ,_+--+--,      ^)      ^\\
               { (@)    } f   ,(  ,+-^ __*_*_  ^^\\_   ^\\       )
              {:;-/    (_+*-+^^^^^+*+*<_ _++_)_    )    )      /
             ( /  (    (        ,___    ^*+_+* )   <    <      \\
              U _/     )    *--<  ) ^\\-----++__)   )    )       )
               (      )  _(^)^^))  )  )\\^^^^^))^*+/    /       /
             (      /  (_))_^)) )  )  ))^^^^^))^^^)__/     +^^
            (     ,/    (^))^))  )  ) ))^^^^^^^))^^)       _)
             *+__+*       (_))^)  ) ) ))^^^^^^))^^^^^)____*^
             \\             \\_)^)_)) ))^^^^^^^^^^))^^^^)
              (_             ^\\__^^^^^^^^^^^^))^^^^^^^)
                ^\\___            ^\\__^^^^^^))^^^^^^^^)\\\\
                     ^^^^^\\uuu/^^\\uuu/^^^^\\^\\^\\^\\^\\^\\^\\^\\
                        ___) >____) >___   ^\\_\\_\\_\\_\\_\\_\\)
                       ^^^//\\\\_^^//\\\\_^       ^(\\_\\_\\_\\)
                         ^^^ ^^ ^^^ ^`,
    turtle: `
        \\                                  ___-------___
         \\                             _-~~             ~~-_
          \\                         _-~                    /~-_
                 /^\\__/^\\         /~  \\                   /    \\
               /|  O  ||  O |        /      \\_______________/        \\
              | |___||__|      /       /                \\          \\
              |          \\    /      /                    \\          \\
              |   (_______) /______/                        \\_________ \\
              |       U      / /         \\                      /            \\
               \\         \\^\\\\         \\                  /               \\     /
                 \\         ||           \\______________/      _-_       //\\__//
                   \\       ||------_-~~-_ ------------- \\ --/~   ~\\    || __/
                     ~-----||====/~     |==================|       |/~~~~~
                      (_(__/  ./     /                    \\_\\      \\.
                             (_(___/                         \\_____)_)`,
    elephant: `
        \\     /\\  ___  /\\
         \\   // \\/   \\/ \\\\
            ((    O O    ))
             \\\\ /     \\ //
              \\/  | |  \\/
               |  | |  |
               |  | |  |
               |   o   |
               | |   | |
               |m|   |m|`,
  };

  const generateAsciiArt = (text: string, charName: string): string => {
    const lines = text.split(/\r?\n/);
    const maxLength = Math.max(...lines.map(line => line.length));

    let bubble = ' ' + '_'.repeat(maxLength + 2) + ' \n';

    if (lines.length === 1) {
      bubble += `< ${lines[0]} >\n`;
    } else {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const padding = ' '.repeat(maxLength - line.length);
        let border = '';
        if (i === 0) {
          border = '/';
        } else if (i === lines.length - 1) {
          border = '\\';
        } else {
          border = '|';
        }

        let rightBorder = '';
        if (i === 0) {
          rightBorder = '\\';
        } else if (i === lines.length - 1) {
          rightBorder = '/';
        } else {
          rightBorder = '|';
        }

        bubble += `${border} ${line}${padding} ${rightBorder}\n`;
      }
    }

    bubble += ' ' + '-'.repeat(maxLength + 2) + ' \n';

    const art = arts[charName] || arts['cowsay'];

    return bubble + art.replace(/^\n/, '');
  };

  if (replace) {
    return textEditor.edit(editBuilder => {
      textEditor.selections.forEach(selection => {
        const text = textEditor.document.getText(selection);
        editBuilder.replace(selection, generateAsciiArt(text, character));
      });
    });
  } else {
    const result = textEditor.selections.map(selection => generateAsciiArt(textEditor.document.getText(selection), character)).join('\n\n');
    return openTextDocument(result).then(() => { });
  }
};
